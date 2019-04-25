declare function require(name:string);
import {Pool, PoolClient} from 'pg';
import {Block} from '../namespaces/block';
import {Transaction} from '../namespaces/transaction';

export class database_handler{
    private pool: Pool;
    constructor(username:string, password:string, host:string, port:number, database:string){
        this.pool = new Pool({
            user: username,
            host: host,
            database: database,
            password: password,
            port: port,
        });
        //Test connection
        this.pool.query('SELECT NOW()', (err, res) => {
            if(err){
                console.error('Error authenticating to Database for pool.');
            }else{
                console.log("Started Database. Server time is " + res.rows[0].now);
            }
        });  
    }

    /**
     * Create the block query, transaction data and update address values.
     * Submit socket update notifications to transaction instance if a relevant address is updated.
     * @param BlockInstance The block instance containing all relevant data.
     */
    public insertBlock(BlockInstance:Block):Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN')
                await this.insertBlockQuery(client, BlockInstance).then(async result => {
                    let isCreated = result[0];
                    let isSkipped = result[1];
                    if(isCreated == true && isSkipped == false){
                        //Look through transactions and insert into database.
                        for (var i = 0, len = BlockInstance.getTransactions().length; i < len; i++) {
                            await this.insertTransactionQuery(client, BlockInstance, i).then(async result => {
                                let transactionID = result[1];
                                let isTXCreated = result[0];
                                if(!isTXCreated){
                                    //Error
                                    await client.query('ROLLBACK');
                                    reject();
                                }else if(transactionID == len - 1){
                                    console.log("  >> Created Transactions (" + len + ")");
                                    await client.query('COMMIT');
                                    resolve(true);
                                }
                            });
                            
                        }
                        
                    }else{
                        await client.query('ROLLBACK');
                        if(isSkipped == true){
                            resolve(true);
                        }else{
                            reject();
                        }
                    }
                }).catch(() => {
                    console.log("Error inserting block.");
                })
            } catch(e) {
                console.log(e);
                await client.query('ROLLBACK');
                reject();
            } finally {
                client.release();
            }
        });
    }

    private insertBlockQuery(poolClient:PoolClient, block:Block):Promise<boolean[]> {
        return new Promise<boolean[]>(async (resolve, reject) => {
            try {
                await poolClient.query('INSERT INTO blocks(height, hash, size, version, versionhex, merkleroot, time, nonce, chainwork, totalSent, totalrecieved, totalfee, totaltransactions) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
                [block.getBlockHeight(), block.getBlockHash(), block.getBlockSize(), block.getBlockVersion(), block.getBlockVersionHex(), block.getBlockMerkleRoot(), block.getBlockTime(), block.getBlockNonce(), block.getBlockChainwork(), block.getTotalSent(), block.getTotalRecieved(), block.getTotalFee(), block.getTransactions().length]);
                resolve([true, false]);
            } catch (e) {
                if(e.code == '23505'){
                    console.log("  >> Already created - skipped.")
                    resolve([true, true]);
                }else{
                    console.log(e);
                    if(e.error !== 'current transaction is aborted, commands ignored until end of transaction block') console.error(e, e.code, "A");
                    resolve([false, false]);
                }
            }
        });
    }

    private insertTransactionQuery(poolClient:PoolClient, BlockInstance:Block, transactionID:number) {
        let transaction:Transaction = BlockInstance.getTransactions()[transactionID];
        return new Promise<object>(async (resolve, reject) => {
            try {
                await poolClient.query('INSERT INTO transactions(transactionid, version, size, totalsent, totalrecieved, totalfee, senders, receivers) VALUES($1, $2, $3, $4, $5, $6, $7, $8)', [transaction.getTransactionID(), transaction.getVersion(), transaction.getSize(), transaction.getTotalSent(), transaction.getTotalRecieved(), transaction.calculateFee(), transaction.getSenders(), transaction.getReceivers()]);
                resolve([true, transactionID]);
            } catch (e) {
                console.log(e);
                resolve([false, -1]);
            }
        });
    }

    public getDatabaseHeight():Promise<number> {
        return new Promise<number>(async (resolve, reject) => {
            try {
                const res = await this.pool.query('SELECT height from blocks ORDER BY height desc limit 1;');
                resolve(res.rows[0].height);
            } catch (e) {
                console.log(e);
                resolve(-1);
            }
        });
    }

}