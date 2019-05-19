declare function require(name:string);
import {Pool, PoolClient} from 'pg';
import {Block} from '../namespaces/block';
import {Transaction} from '../namespaces/transaction';
import {confirmed_deposit, unconfirmed_deposit, confirmed_withdraw, unconfirmed_withdraw} from '../events';

export class database_handler{
    private pool: Pool;
    private confirmed_deposit_event:confirmed_deposit;
    private unconfirmed_deposit_event:unconfirmed_deposit;
    private confirmed_withdraw_event:confirmed_withdraw;
    private unconfirmed_withdraw_event:unconfirmed_withdraw;

    constructor(username:string, password:string, host:string, port:number, database:string, confirmed_deposit_event: confirmed_deposit, unconfirmed_deposit_event: unconfirmed_deposit, confirmed_withdraw_event: confirmed_withdraw, unconfirmed_withdraw_event: unconfirmed_withdraw){
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
        this.confirmed_deposit_event = confirmed_deposit_event;
        this.unconfirmed_deposit_event = unconfirmed_deposit_event;
        this.confirmed_withdraw_event = confirmed_withdraw_event;
        this.unconfirmed_withdraw_event = unconfirmed_withdraw_event;  
    }

    /**
     * Create the block query, transaction data and update address values.
     * Submit socket update notifications to transaction instance if a relevant address is updated.
     * @param BlockInstance The block instance containing all relevant data.
     */
    public insertBlock(BlockInstance:Block, isConfirmed: boolean):Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject('insertBlockTimeout');
              }, 10000);
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN')
                await this.insertBlockQuery(client, BlockInstance, isConfirmed).then(async result => {
                    let isCreated = result[0];
                    let isSkipped = result[1];
                    if(isCreated == true && isSkipped == false){
                        //Look through transactions and insert into database.
                        for (var i = 0, len = BlockInstance.getTransactions().length; i < len; i++) {
                            await this.insertTransactionQuery(client, BlockInstance, i, isConfirmed).then(async result => {
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
    private insertBlockQuery(poolClient:PoolClient, block:Block, isConfirmed: boolean):Promise<boolean[]> {
        return new Promise<boolean[]>(async (resolve, reject) => {
            try {
                await poolClient.query('INSERT INTO blocks(height, hash, size, version, versionhex, merkleroot, time, nonce, chainwork, totalSent, totalrecieved, totalfee, totaltransactions, diff, bits, confirmed, transactions) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)',
                [block.getBlockHeight(), block.getBlockHash(), block.getBlockSize(), block.getBlockVersion(), block.getBlockVersionHex(), block.getBlockMerkleRoot(), block.getBlockTime(), block.getBlockNonce(), block.getBlockChainwork(), block.getTotalSent(), block.getTotalRecieved(), block.getTotalFee(), block.getTransactions().length, block.getBlockDifficulty(), block.getBlockBits(), isConfirmed, block.getTransactionsJSON()]);
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
    private insertTransactionQuery(poolClient:PoolClient, BlockInstance:Block, transactionID:number, isConfirmed: boolean) {
        let transaction:Transaction = BlockInstance.getTransactions()[transactionID];
        return new Promise<object>(async (resolve, reject) => {
            try {
                await poolClient.query('INSERT INTO transactions(transactionid, version, size, totalsent, totalrecieved, totalfee, senders, receivers, time, confirmed, height) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [transaction.getTransactionID(), transaction.getVersion(), transaction.getSize(), transaction.getTotalSent(), transaction.getTotalRecieved(), transaction.calculateFee(), transaction.getSenders(), transaction.getReceivers(), transaction.getTime(), isConfirmed, transaction.getHeight()]);
                for (var i = 0, len = Object.keys(transaction.getReceivers()).length; i < len; i++) {
                    await this.insertAddressQuery(poolClient, Object.keys(transaction.getReceivers())[i], transaction.getReceivers()[Object.keys(transaction.getReceivers())[i]], isConfirmed);
                }
                for (var i = 0, len = Object.keys(transaction.getSenders()).length; i < len; i++) {
                    await this.insertAddressQuery(poolClient, Object.keys(transaction.getSenders())[i], -transaction.getSenders()[Object.keys(transaction.getSenders())[i]], isConfirmed);
                }
                const FEES = await transaction.calculateFee();
                if(FEES !== 0) await this.insertAddressQuery(poolClient, 'FEES', FEES, isConfirmed);
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
                        const res = await poolClient.query("UPDATE addresses SET confirmed = confirmed + $2, unconfirmed = unconfirmed + $3, totalreceived = totalreceived + $4, totalsent = totalsent + $5 where address=$1 RETURNING events", [address, confirmedBalance, unconfirmedBalance, totalreceived, totalsent]);
                        if(res.rows[0].events){
                            if(isSent){
                                if(isConfirmed) this.confirmed_withdraw_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events});
                                if(!isConfirmed) this.unconfirmed_withdraw_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events});
                            }else{
                                if(isConfirmed) this.confirmed_deposit_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events});
                                if(!isConfirmed) this.unconfirmed_deposit_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events});
                            }
                        }
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
     * Used within interface_handler to confirm a series of transactions from a block. 
     * @param {Transaction} transaction The transaction to confirm.
     */
    public confirmTransaction(transaction: Transaction) {

    }


    /**
     * Used within interface_handler to reject a series of transactions from a block.
     * @param {Transaction} transaction The transaction to reject.
     */
    public rejectTransaction(transaction: Transaction){

    }
    
    /**
     * Used to get a list of transaction of a block from the database.
     * @param {Number} blockHeight The height of the block.
     */
    public async getTransactions(blockHeight: number){

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

