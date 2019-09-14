import {interface_handler} from '../rpc_interface/interface_handler';
import {database_handler} from '../postgres/database_handler';
import { timeout, TimeoutError } from 'promise-timeout';
import {confirmed_deposit, unconfirmed_deposit, confirmed_withdraw, unconfirmed_withdraw, mempool_deposit, mempool_withdraw} from '../events';
import API from '../api/api';
var zmq = require('zmq')
var sock = zmq.socket('sub');
const Sentry = require('@sentry/node');
Sentry.init({ dsn: 'https://da70988269814bfeaa532dfda53575da@sentry.io/1480311' });
import _ = require('lodash');
const settings = require('../config/settings.json');



export class sync_manager {

    private rpc_instance:interface_handler;
    private database:database_handler;
    private status: 'STARTING' | 'SYNCING' | 'WAITING';
    private rpcHeight:number;
    private launchedDate:Date;
    private isRetry:boolean = false;
    private listeningUpdateID:any;
    private TOTAL_CONFIRMATIONS = 3;
    private confirmed_deposit_event:confirmed_deposit;
    private unconfirmed_deposit_event:unconfirmed_deposit;
    private confirmed_withdraw_event:confirmed_withdraw;
    private unconfirmed_withdraw_event:unconfirmed_withdraw;
    private mempool_deposit_event:mempool_deposit;
    private mempool_withdraw_event:mempool_withdraw;
    private hasSynced = false;
    private API:API;


    constructor(rpc:interface_handler, db:database_handler, confirmed_deposit_event: confirmed_deposit, unconfirmed_deposit_event: unconfirmed_deposit, confirmed_withdraw_event: confirmed_withdraw, unconfirmed_withdraw_event: unconfirmed_withdraw, mempool_deposit_event: mempool_deposit, mempool_withdraw: mempool_withdraw, API: API){
        this.rpc_instance = rpc;
        this.database = db;
        this.status = 'STARTING';
        this.confirmed_deposit_event = confirmed_deposit_event;
        this.unconfirmed_deposit_event = unconfirmed_deposit_event;
        this.confirmed_withdraw_event = confirmed_withdraw_event;
        this.unconfirmed_withdraw_event = unconfirmed_withdraw_event;
        this.mempool_deposit_event = mempool_deposit_event;
        this.mempool_withdraw_event = mempool_withdraw;
        this.API = API;
    }

    /**
     * EVENTS
     */
    private async registerEvents(){
       this.confirmed_deposit_event.addSubscriber(async (data:any) => {
            let invoiceID = data.data.events.invoiceID;
            let redirectionAddress = await this.API.getRedirectionAddress(invoiceID);
            let paymenttransactionid = await this.rpc_instance.createTransaction(invoiceID, redirectionAddress.address, data.data.amount);
            data.data.paymentTransactionID = paymenttransactionid;
            this.API.relayUpdate('CONFIRMED_DEPOSIT', data);
        });

        this.unconfirmed_deposit_event.addSubscriber((data:any) => {
            this.API.relayUpdate('UNCONFIRMED_DEPOSIT', data);
        });

        this.mempool_deposit_event.addSubscriber((data:any) => {
            this.API.relayUpdate('MEMPOOL_DEPOSIT', data);
        });
        
        this.confirmed_withdraw_event.addSubscriber((data:any) => {
            //this.API.relayUpdate('CONFIRMED_WITHDRAW', data);
        });

        this.unconfirmed_withdraw_event.addSubscriber((data:any) => {
           // this.API.relayUpdate('UNCONFIRMED_WITHDRAW', data);
        });


        this.mempool_withdraw_event.addSubscriber((data:any) => {
            //this.API.relayUpdate('MEMPOOL_WITHDRAW', data);
        });
    }


    public async startFullSync() {
        this.status = 'WAITING';
        const databaseHeight = await this.database.getDatabaseHeight();
        this.rpc_instance.blockHeight = databaseHeight;
        this.rpcHeight = await this.rpc_instance.getBlockCount();
        this.launchedDate = new Date();
        const diff = Math.abs(this.rpcHeight - databaseHeight);
        console.log("~~~~~~~~~~~~~~~~~~[Australia Crypto]~~~~~~~~~~~~~~~~~");
        console.log("Loaded database height:", databaseHeight);
        console.log("Loaded RPC height:", this.rpcHeight);
        console.log("Difference:", diff);
        console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~")
        this.registerEvents();
        this.confirmBlocks(databaseHeight);
        this.rpc_instance.startMempoolListen(this.database);
        //const dbBlock = await this.database.getBlock(265084);
        //const rpcBlock = await this.rpc_instance.getBlock(265084);
        if(databaseHeight !== this.rpcHeight) {
            this.loopSyncFunc(databaseHeight + 1);
        }else{
            this.hasSynced = true;
            this.listenUpdates();
        }
    }

    private async loopSyncFunc(block_id:number) {
        this.rpcHeight = await this.rpc_instance.getBlockCount();
        const diff:number = Math.abs(this.rpcHeight - block_id);
        const isConfirmed = (diff >= this.TOTAL_CONFIRMATIONS) ? true : false;
        this.status = 'SYNCING';
        this.rpc_instance.getBlock(block_id).then(block => {
            console.log("Creating new Block #" + block_id + ":", isConfirmed);
            console.log("  >> Loaded block #" + block_id);
            timeout(this.database.insertBlock(block, isConfirmed).then(async ifOkay => {
                console.log("  >> Created Block #" + block_id);
                //Block confirmation 3 blocks ago...
               if(!isConfirmed) await this.confirmBlocks(block_id);
                block_id++;
                if(!this.hasSynced) this.loopSyncFunc(block_id);
            }).catch((e) => {
                Sentry.captureMessage(new Error(e));
                console.log("Error creating block #" + block_id);
            }), 10000).catch((err) => {
                if (err instanceof TimeoutError) {
                  //Timed out, retry.
                  console.error('Timed out on Block ID:', block_id);
                  this.loopSyncFunc(block_id);
                }
            });
            
        }).catch(async (e) => {
            // Potentiallly at latest block height. 
            this.rpcHeight = await this.rpc_instance.getBlockCount();
            //A few coins have the starting block at 0.
            if(this.rpcHeight < block_id){
                //Fully synced! 
                this.hasSynced = true;
                this.rpc_instance.blockHeight = this.rpcHeight;
                console.log('Synced to latest height!');
                this.status = 'WAITING';
                //Start check for future updates.
                this.listenUpdates();
            }else if(this.rpcHeight > block_id || this.rpcHeight == 0 || this.isRetry == true){
                console.error("Error loading block from RPC:", block_id);
                this.isRetry = false;
                block_id++;
                this.loopSyncFunc(block_id);
            }else{
                console.error("Attempting retry: ", block_id);
                this.isRetry = true;
                this.loopSyncFunc(block_id);
            }
        });
    }

    private async listenUpdates(){
        console.log('Listening for block updates.');
        sock.connect(settings.COIN_DETAILS.ZMQ);
        sock.subscribe('hashblock');
        var self = this;
        sock.on('message', async function(topic:string, message:string) {
            setTimeout(() => {
                self.rpc_instance.blockHeight += 1;
                self.loopSyncFunc(self.rpc_instance.blockHeight);
            }, 500);
        });
        
    }


    private async confirmBlocks(latestHeight:number) {
        const unConfirmedBlocks = await this.database.getUnconfirmedBlocks(latestHeight);
        this.rpcHeight = await this.rpc_instance.getBlockCount();
        if(unConfirmedBlocks === null) return false;
        for(let i = 0, len = unConfirmedBlocks.length; i < len; i++){
            const dbBlock = await this.database.getBlock(unConfirmedBlocks[i]["height"]);
            const rpcBlock = await this.rpc_instance.getBlock(unConfirmedBlocks[i]["height"]);
            let blockCheckRes = await this.database.verifyBlock(rpcBlock, dbBlock);
            const diff:number = Math.abs(this.rpcHeight - unConfirmedBlocks[i]["height"]);
            const isConfirmed = (diff >= this.TOTAL_CONFIRMATIONS) ? true : false;
            if(blockCheckRes !== 'CLEAN') {
                //Reject old transactions
                const rejectTransactions = () => new Promise(async resolve => {
                    for(let x = 0; x < dbBlock.getTransactions().length; x++) {
                        await this.database.rejectTransaction(dbBlock.getTransactions()[x], undefined, false, false);
                        if(x == dbBlock.getTransactions().length - 1) return resolve();
                    }
                });
                await rejectTransactions();
                await this.database.deleteBlock(unConfirmedBlocks[i]["height"]);
                timeout(this.database.insertBlock(rpcBlock, isConfirmed).then(async ifOkay => {
                    console.log("  >> Created Block [B]#" + unConfirmedBlocks[i]["height"]);
                    //Block confirmation 3 blocks ago...
                }).catch((e) => {
                    Sentry.captureMessage(new Error(e));
                    console.log("Error creating block [B]#" + unConfirmedBlocks[i]["height"]);
                }), 10000).catch((err) => {
                    if (err instanceof TimeoutError) {
                      //Timed out, retry.
                      console.error('Timed out on Block ID [B]:', unConfirmedBlocks[i]["height"]);
                    }
                });
            }
            if(i == unConfirmedBlocks.length - 1) return true;
        }
    }
    /**
     * Returns the current status of the sync manager.
     */
    public getStatus():string {
        return this.status;
    }

}