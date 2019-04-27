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
                await client.query('ROLLBACK');
                reject();
            } finally {
                client.release();
            }
        });
    }

    /**
     * Function for executing the insert of a block in a SQL query.
     * @param {PoolClient} poolClient The current pool client for correct transaction isolation.
     * @param {Block} block The Block instance to insert.
     */
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
                    if(e.error !== 'current transaction is aborted, commands ignored until end of transaction block') console.error(e, e.code, "A");
                    resolve([false, false]);
                }
            }
        });
    }

    /**
     * Used to execute the insert of the transaction within a SQL query. Will also execute address balance update while loaded.
     * @param {PoolClient} poolClient The current pool client for correct transaction isolation.
     * @param {Block} BlockInstance The Block with the transaction to insert.
     * @param {number} transactionID The index of the transaction from the block.
     */
    private insertTransactionQuery(poolClient:PoolClient, BlockInstance:Block, transactionID:number) {
        let transaction:Transaction = BlockInstance.getTransactions()[transactionID];
        return new Promise<object>(async (resolve, reject) => {
            try {
                await poolClient.query('INSERT INTO transactions(transactionid, version, size, totalsent, totalrecieved, totalfee, senders, receivers) VALUES($1, $2, $3, $4, $5, $6, $7, $8)', [transaction.getTransactionID(), transaction.getVersion(), transaction.getSize(), transaction.getTotalSent(), transaction.getTotalRecieved(), transaction.calculateFee(), transaction.getSenders(), transaction.getReceivers()]);
                for (var i = 0, len = Object.keys(transaction.getReceivers()).length; i < len; i++) {
                    await this.insertAddressQuery(poolClient, Object.keys(transaction.getReceivers())[i], transaction.getReceivers()[Object.keys(transaction.getReceivers())[i]], true);
                }
                for (var i = 0, len = Object.keys(transaction.getSenders()).length; i < len; i++) {
                    await this.insertAddressQuery(poolClient, Object.keys(transaction.getSenders())[i], -transaction.getSenders()[Object.keys(transaction.getSenders())[i]], true);
                }
                await this.insertAddressQuery(poolClient, 'FEES', transaction.calculateFee(), true);
                resolve([true, transactionID]);
            } catch (e) {
                resolve([false, -1]);
            }
        });
    }

    /**
     * Used within insertTransactionQuery to insert or update a address balance with attempted to insert at the address,
     * If it fails this means the address already exists therefore update the address balance.
     * If the isConfirmed is true, the balance will update the 'unconfirmed' balance. 
     * @param {PoolClient} poolClient The current pool client for correct transaction isolation.
     * @param {String} address The address to update or insert.
     * @param {Number} balance The balance to add or subtract from the address.
     * @param {boolean} isConfirmed If the transaction update is confirmed ( > x amount of confirmations to prevent false transactions).
     */
    private insertAddressQuery(poolClient:PoolClient, address:string, balance:number, isConfirmed:boolean) {
        const confirmedBalance = isConfirmed ? balance : 0;
        const unconfirmedBalance = !isConfirmed? balance : 0;
        const isSent = balance >= 0 ? false : true; 
        const totalsent = isSent ? confirmedBalance : 0;
        const totalreceived = !isSent ? confirmedBalance : 0;
        return new Promise<object>(async (resolve, reject) => {
            try {
                await poolClient.query("SAVEPOINT prior_insert");
                await poolClient.query('INSERT INTO addresses(address, confirmed, unconfirmed, totalreceived, totalsent, created) VALUES($1, $2, $3, $4, $5, now())', [address, confirmedBalance, unconfirmedBalance, totalreceived, totalsent]);
                resolve([true]);
            } catch (e) {
                await poolClient.query("ROLLBACK TO SAVEPOINT prior_insert");
                if(e.routine == '_bt_check_unique'){
                    try {
                        await poolClient.query("UPDATE addresses SET confirmed = confirmed + $2, unconfirmed = unconfirmed + $3, totalreceived = totalreceived + $4, totalsent = totalsent + $5 where address=$1", [address, confirmedBalance, unconfirmedBalance, totalreceived, totalsent]);
                        resolve([true]);
                    } catch (e) {
                        resolve([false]);
                    }
                } else {
                    resolve([false]);
                }
            }
        });
    }


    /**
     * Get the current blockheight from the database.
     */
    public getDatabaseHeight():Promise<number> {
        return new Promise<number>(async (resolve, reject) => {
            try {
                const res = await this.pool.query('SELECT height from blocks ORDER BY height desc limit 1;');
                resolve(res.rows[0].height);
            } catch (e) {
                resolve(-1);
            }
        });
    }

}