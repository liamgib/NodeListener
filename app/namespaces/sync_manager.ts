import {interface_handler} from '../rpc_interface/interface_handler';
import {database_handler} from '../postgres/database_handler';
import { timeout, TimeoutError } from 'promise-timeout';
export class sync_manager {

    private rpc_instance:interface_handler;
    private database:database_handler;
    private status: 'STARTING' | 'SYNCING' | 'WAITING';
    private rpcHeight:number;
    private launchedDate:Date;
    private isRetry:boolean = false;
    private listeningUpdateID:timeout;
    private TOTAL_CONFIRMATIONS = 3;


    constructor(rpc:interface_handler, db:database_handler){
        this.rpc_instance = rpc;
        this.database = db;
        this.status = 'STARTING';
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
        if(databaseHeight !== this.rpcHeight) {
            this.loopSyncFunc(databaseHeight + 1);
        }else{
            this.listenUpdates();
        }
    }

    private loopSyncFunc(block_id:number) {
        const diff:number = Math.abs(this.rpcHeight - block_id);
        const isConfirmed = (diff > this.TOTAL_CONFIRMATIONS) ? true : false;
        this.status = 'SYNCING';
        console.log("Creating new Block #" + block_id + ":", block_id);
        this.rpc_instance.getBlock(block_id).then(block => {
            console.log("  >> Loaded block #" + block_id);
            timeout(this.database.insertBlock(block).then(ifOkay => {
                console.log("  >> Created Block #" + block_id);
                block_id++;
                this.loopSyncFunc(block_id);
            }).catch(() => {
                console.log("Error creating block #" + block_id);
            }), 10000).catch((err) => {
                if (err instanceof TimeoutError) {
                  console.error('Timeout :-(');
                }
            });
            
        }).catch(async () => {
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
        console.log('Listening out for updates.');
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