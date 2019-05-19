import {interface_handler} from '../rpc_interface/interface_handler';
import {database_handler} from '../postgres/database_handler';
import { timeout, TimeoutError } from 'promise-timeout';
import {confirmed_deposit, unconfirmed_deposit, confirmed_withdraw, unconfirmed_withdraw} from '../events';




export class sync_manager {

    private rpc_instance:interface_handler;
    private database:database_handler;
    private status: 'STARTING' | 'SYNCING' | 'WAITING';
    private rpcHeight:number;
    private launchedDate:Date;
    private isRetry:boolean = false;
    private listeningUpdateID:timeout;
    private TOTAL_CONFIRMATIONS = 3;
    private confirmed_deposit_event:confirmed_deposit;
    private unconfirmed_deposit_event:unconfirmed_deposit;
    private confirmed_withdraw_event:confirmed_withdraw;
    private unconfirmed_withdraw_event:unconfirmed_withdraw;



    constructor(rpc:interface_handler, db:database_handler, confirmed_deposit_event: confirmed_deposit, unconfirmed_deposit_event: unconfirmed_deposit, confirmed_withdraw_event: confirmed_withdraw, unconfirmed_withdraw_event: unconfirmed_withdraw){
        this.rpc_instance = rpc;
        this.database = db;
        this.status = 'STARTING';
        this.confirmed_deposit_event = confirmed_deposit_event;
        this.unconfirmed_deposit_event = unconfirmed_deposit_event;
        this.confirmed_withdraw_event = confirmed_withdraw_event;
        this.unconfirmed_withdraw_event = unconfirmed_withdraw_event;
    }

    /**
     * EVENTS
     */
    private async registerEvents(){
       this.confirmed_deposit_event.addSubscriber((data) => {
            console.log("Confirmed Deposit", data);
        });

        this.unconfirmed_deposit_event.addSubscriber((data) => {
            console.log("Unconfirmed Deposit", data);
        });

        this.confirmed_withdraw_event.addSubscriber((data) => {
            console.log("Confirmed Withdraw", data);
        });

        this.unconfirmed_withdraw_event.addSubscriber((data) => {
            console.log("unconfirmed Withdraw", data);
        });
    }

    public async startFullSync() {
        this.status = 'WAITING';
        const databaseHeight = await this.database.getDatabaseHeight();
        this.rpcHeight = await this.rpc_instance.getBlockCount();
        this.launchedDate = new Date();
        const diff = Math.abs(this.rpcHeight - databaseHeight);
        console.log("~~~~~~~~~~~~~~~~~~[Australia Crypto]~~~~~~~~~~~~~~~~~");
        console.log("Loaded database height:", databaseHeight);
        console.log("Loaded RPC height:", this.rpcHeight);
        console.log("Difference:", diff);
        console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
        this.registerEvents();
        if(databaseHeight !== this.rpcHeight) {
            this.loopSyncFunc(databaseHeight + 1);
        }else{
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
            timeout(this.database.insertBlock(block, isConfirmed).then(ifOkay => {
                console.log("  >> Created Block #" + block_id);
                block_id++;
                this.loopSyncFunc(block_id);
            }).catch((e) => {
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
        this.listeningUpdateID = setInterval(async () => {
            const databaseHeight = await this.database.getDatabaseHeight();
            this.rpcHeight = await this.rpc_instance.getBlockCount();
            if(databaseHeight !== this.rpcHeight) {
                clearTimeout(this.listeningUpdateID);
                this.loopSyncFunc(databaseHeight + 1);
            }
        }, 30000);
    }

    /**
     * Returns the current status of the sync manager.
     */
    public getStatus():string {
        return this.status;
    }

}