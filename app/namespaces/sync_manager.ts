import {interface_handler} from '../rpc_interface/interface_handler';
import {database_handler} from '../postgres/database_handler';

export class sync_manager {

    private rpc_instance:interface_handler;
    private database:database_handler;
    private status: 'STARTING' | 'SYNCING' | 'WAITING';

    constructor(rpc:interface_handler, db:database_handler){
        this.rpc_instance = rpc;
        this.database = db;
        this.status = 'STARTING';
    }


    public async startFullSync() {
        this.status = 'SYNCING';
        const databaseHeight = await this.database.getDatabaseHeight();
        const rpcHeight = await this.rpc_instance.getBlockCount();
        const diff = Math.abs(rpcHeight - databaseHeight);
        console.log("~~~~~~~~~~~~~~~~~~[AustraliaCRYPTO]~~~~~~~~~~~~~~~~~~");
        console.log("Loaded database height:", databaseHeight);
        console.log("Loaded RPC height:", rpcHeight);
        console.log("Difference:", diff);
        console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
        this.loopSyncFunc(databaseHeight + 1);
    }

    private loopSyncFunc(block_id:number) {
        console.log("Creating new Block #" + block_id + ":");
        this.rpc_instance.getBlock(block_id).then(block => {
            console.log("  >> Loaded block #" + block_id);
            this.database.insertBlock(block).then(ifOkay => {
                console.log("  >> Created Block #" + block_id);
                block_id++;
                this.loopSyncFunc(block_id);
            }).catch(() => {
                console.log("Error creating block #" + block_id);
            });
            
        }).catch(() => {
            console.log("Error loading block from RPC:", block_id);
        });
    }

    /**
     * Returns the current status of the sync manager.
     */
    public getStatus():string {
        return this.status;
    }
}