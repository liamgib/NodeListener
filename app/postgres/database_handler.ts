import {Pool, PoolClient} from 'pg';
import {Block} from '../namespaces/block';
import {Transaction} from '../namespaces/transaction';
import {confirmed_deposit, unconfirmed_deposit, confirmed_withdraw, unconfirmed_withdraw, mempool_withdraw, mempool_deposit} from '../events';
import _ = require('lodash');

export class database_handler {
    private pool: Pool;
    private confirmed_deposit_event:confirmed_deposit;
    private unconfirmed_deposit_event:unconfirmed_deposit;
    private confirmed_withdraw_event:confirmed_withdraw;
    private unconfirmed_withdraw_event:unconfirmed_withdraw;
    private mempool_withdraw_event: mempool_withdraw;
    private mempool_deposit_event: mempool_deposit;

    constructor(username:string, password:string, host:string, port:number, database:string, confirmed_deposit_event: confirmed_deposit, unconfirmed_deposit_event: unconfirmed_deposit, confirmed_withdraw_event: confirmed_withdraw, unconfirmed_withdraw_event: unconfirmed_withdraw, mempool_deposit_event: mempool_deposit, mempool_withdraw_event: mempool_withdraw,){
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
        this.mempool_deposit_event = mempool_deposit_event;
        this.mempool_withdraw_event = mempool_withdraw_event;
    }

    /**
     * Will delete the block height associated.
     * @param blockHeight The block height to delete
     */
    public deleteBlock(blockHeight):Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                client.query('DELETE FROM blocks where height=$1',[blockHeight]);
                await client.query('COMMIT');
                return resolve(true);
            } catch(e) {
                await client.query('ROLLBACK');
                return resolve(false);
            } finally {
                client.release();
            }
        });
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
                let hasFailed = false;
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
                                    hasFailed = true;
                                    await client.query('ROLLBACK');
                                    reject();
                                }else if(transactionID == len - 1){
                                    if(!hasFailed){
                                        console.log("  >> Created Transactions (" + len + ")");
                                        await client.query('COMMIT');
                                        resolve(true);
                                    }
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
                }).catch((e) => {
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
        return new Promise<any>(async (resolve, reject) => {
            try {
                const res = await poolClient.query('SELECT * from mempooltransactions where transactionid = $1', [transaction.getTransactionID()]);
                let failed = false;
                let code = '';
                let hasMempool = res.rowCount > 0 ? true : false;
                let checkTransaction = async () => new Promise(async resolve => {
                    if(res.rowCount > 0 ){
                        let mRow= res.rows[0];
                        let mempoolTransaction = new Transaction(mRow.transactionid, parseInt(mRow.version), parseInt(mRow.size), parseInt(mRow.time), transaction.getHeight());
                        //Add senders
                        for(let x = 0, lenx = Object.keys(mRow.senders).length; x < lenx; x++){
                            mempoolTransaction.addSender(Object.keys(mRow.senders)[x], mRow.senders[Object.keys(mRow.senders)[x]]);
                            if(x == lenx - 1) {
                                //Add Receivers
                                for(let y = 0, leny = Object.keys(mRow.receivers).length; y < leny; y++){
                                    mempoolTransaction.addReciever(Object.keys(mRow.receivers)[y], mRow.receivers[Object.keys(mRow.receivers)[y]]);
                                    if(y == leny - 1) {
                                        if(transaction.getVersion() !== mempoolTransaction.getVersion()){ failed = true; code = 'VERSION' };
                                        if(transaction.getSize() !== mempoolTransaction.getSize()){ failed = true; code = 'SIZE' };
                                        if(transaction.getTotalRecieved() !== mempoolTransaction.getTotalRecieved()){ failed = true; code = 'TOTAL_RECIEVED' };
                                        if(transaction.getTotalSent() !== mempoolTransaction.getTotalSent()){ failed = true; code = 'TOTAL_SENT' };
                                        if(transaction.calculateFee() !== mempoolTransaction.calculateFee()){ failed = true; code = 'FEE' };
                                        //Compare sender addresses and amounts;
                                        const checkSenderAddresses = () => new Promise(resolve => {
                                            if(failed) return resolve();
                                            if(Object.keys(transaction.getSenders()).length !== Object.keys(mempoolTransaction.getSenders()).length){ failed = true; return resolve() };
                                            _.forEach(Object.keys(transaction.getSenders()), async (transactionSenderAddress, y) => {
                                                if(transaction.getSenders()[transactionSenderAddress] !== mempoolTransaction.getSenders()[transactionSenderAddress]){ failed = true; code = `SENDERS-${i}` };
                                                if(y == Object.keys(transaction.getSenders()).length - 1) {
                                                    resolve();
                                                }
                                            });
                                        });
                                        await checkSenderAddresses();
                                        
                                        //Compare sender addresses and amounts;
                                        const checkReceiverAddresses = () => new Promise(resolve => {
                                            if(failed) return resolve();
                                            if(Object.keys(transaction.getReceivers()).length !== Object.keys(mempoolTransaction.getReceivers()).length){ failed = true; return resolve() };
                                            _.forEach(Object.keys(transaction.getReceivers()), async (transactionSenderAddress, y) => {
                                                if(transaction.getReceivers()[transactionSenderAddress] !== mempoolTransaction.getReceivers()[transactionSenderAddress]){ failed = true; code = `Receivers-${i}` };
                                                if(y == Object.keys(transaction.getReceivers()).length - 1) {
                                                    resolve();
                                                }
                                            });
                                        });
                                        if(!failed) await checkReceiverAddresses();
                                        if(failed) {
                                            //Failed
                                            await this.rejectTransaction(mempoolTransaction, poolClient, isConfirmed, true);
                                            hasMempool = false;
                                            resolve();
                                        }else{
                                            //Remove transaction from DB
                                            let res = await poolClient.query('DELETE from mempooltransactions where transactionid = $1', [transaction.getTransactionID()]);
                                            resolve();
                                        }
                                    }
                                }
                            }
                        }
                    }else{
                        resolve();
                    }
                });
                await checkTransaction();
                await poolClient.query('INSERT INTO transactions(transactionid, version, size, totalsent, totalrecieved, totalfee, senders, receivers, time, confirmed, height, opreturns, opreturnvalues) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)', [transaction.getTransactionID(), transaction.getVersion(), transaction.getSize(), transaction.getTotalSent(), transaction.getTotalRecieved(), transaction.calculateFee(), transaction.getSenders(), transaction.getReceivers(), transaction.getTime(), isConfirmed, transaction.getHeight(), transaction.getOPReturns(), transaction.getOPReturnValues()]);
                if(!hasMempool){
                    for (var i = 0, len = Object.keys(transaction.getReceivers()).length; i < len; i++) {
                        await this.insertAddressQuery(poolClient, Object.keys(transaction.getReceivers())[i], transaction.getReceivers()[Object.keys(transaction.getReceivers())[i]], isConfirmed, false, transaction.getTransactionID());
                    }
                    for (var i = 0, len = Object.keys(transaction.getSenders()).length; i < len; i++) {
                        await this.insertAddressQuery(poolClient, Object.keys(transaction.getSenders())[i], -transaction.getSenders()[Object.keys(transaction.getSenders())[i]], isConfirmed, false, transaction.getTransactionID());
                    }
                    const FEES = await transaction.calculateFee();
                    if(FEES !== 0) await this.insertAddressQuery(poolClient, 'FEES', FEES, isConfirmed, false, transaction.getTransactionID());
                }else{
                    //Send events
                    for (var i = 0, len = Object.keys(transaction.getReceivers()).length; i < len; i++) {
                        //Get events
                        const res = await poolClient.query("SELECT events from addresses where address = $1 and events is not null", [Object.keys(transaction.getReceivers())[i]]);
                        if(res.rowCount > 0){
                            if(isConfirmed) this.confirmed_deposit_event.triggerEvent({address: Object.keys(transaction.getReceivers())[i], amount: transaction.getReceivers()[Object.keys(transaction.getReceivers())[i]], events: res.rows[0].events, transactionID: transaction.getTransactionID()});
                            if(!isConfirmed) this.unconfirmed_deposit_event.triggerEvent({address: Object.keys(transaction.getReceivers())[i], amount: transaction.getReceivers()[Object.keys(transaction.getReceivers())[i]], events: res.rows[0].events, transactionID: transaction.getTransactionID()});
                        }
                    }
                    for (var i = 0, len = Object.keys(transaction.getSenders()).length; i < len; i++) {
                        const res = await poolClient.query("SELECT events from addresses where address = $1 and events is not null", [Object.keys(transaction.getSenders())[i]]);
                        if(res.rowCount > 0){
                            if(isConfirmed) this.confirmed_withdraw_event.triggerEvent({address: Object.keys(transaction.getSenders())[i], amount: -transaction.getSenders()[Object.keys(transaction.getSenders())[i]], events: res.rows[0].events, transactionID: transaction.getTransactionID()});
                            if(!isConfirmed) this.unconfirmed_withdraw_event.triggerEvent({address: Object.keys(transaction.getSenders())[i], amount: -transaction.getSenders()[Object.keys(transaction.getSenders())[i]], events: res.rows[0].events, transactionID: transaction.getTransactionID()});
                        }
                    }
                    const FEES = await transaction.calculateFee();
                }
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
    private insertAddressQuery(poolClient:PoolClient, address:string, balance:number, isConfirmed:boolean, isMempool = false, transactionID:String) {
        const confirmedBalance = isConfirmed ? balance : 0;
        const unconfirmedBalance = !isConfirmed? balance : 0;
        const isSent = balance >= 0 ? false : true; 
        const totalsent = isSent ? confirmedBalance : 0;
        const totalreceived = !isSent ? confirmedBalance : 0;
        return new Promise<object>(async (resolve, reject) => {
            try {
                await poolClient.query("SAVEPOINT prior_insert");
                const res = await poolClient.query("UPDATE addresses SET confirmed = confirmed + $2, unconfirmed = unconfirmed + $3, totalreceived = totalreceived + $4, totalsent = totalsent + $5 where address=$1 RETURNING events", [address, confirmedBalance, unconfirmedBalance, totalreceived, totalsent]);
                if(res.rows[0].events){
                    if(isSent){
                        if(isConfirmed && isMempool == false) this.confirmed_withdraw_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events, transactionID: transactionID});
                        if(!isConfirmed && isMempool == false) this.unconfirmed_withdraw_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events, transactionID: transactionID});
                        if(isMempool) this.mempool_withdraw_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events, transactionID: transactionID});
                    }else{
                        if(isConfirmed && isMempool == false) this.confirmed_deposit_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events, transactionID: transactionID});
                        if(!isConfirmed && isMempool == false) this.unconfirmed_deposit_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events, transactionID: transactionID});
                        if(isMempool) this.mempool_deposit_event.triggerEvent({address: address, amount: balance, events: res.rows[0].events, transactionID: transactionID});
                    }
                }
                resolve([true]);
            } catch (e) {
                try {
                    await poolClient.query("ROLLBACK TO SAVEPOINT prior_insert");
                    await poolClient.query('INSERT INTO addresses(address, confirmed, unconfirmed, totalreceived, totalsent, created) VALUES($1, $2, $3, $4, $5, now())', [address, confirmedBalance, unconfirmedBalance, totalreceived, totalsent]);
                    resolve([true]);
                } catch (e) {
                    resolve([false]);
                }
            }
        });
    }

    /**
     * Used to insert a memPoolTransaction.
     * @param {Transaction} transaction The transaction to insert.
     */
    public async insertMemPoolTransactionQuery(transaction:Transaction) {
        return new Promise<boolean>(async (resolve, reject) => {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');
                const res = await client.query('SELECT * from transactions where transactionid = $1', [transaction.getTransactionID()]);
                if(res.rowCount > 0) return resolve(false);
                await client.query('INSERT INTO mempooltransactions(transactionid, version, size, totalsent, totalrecieved, totalfee, senders, receivers, time, expectedHeight) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [transaction.getTransactionID(), transaction.getVersion(), transaction.getSize(), transaction.getTotalSent(), transaction.getTotalRecieved(), transaction.calculateFee(), transaction.getSenders(), transaction.getReceivers(), transaction.getTime(), transaction.getHeight()]);
                for (var i = 0, len = Object.keys(transaction.getReceivers()).length; i < len; i++) {
                    await this.insertAddressQuery(client, Object.keys(transaction.getReceivers())[i], transaction.getReceivers()[Object.keys(transaction.getReceivers())[i]], false, true, transaction.getTransactionID());
                }
                for (var i = 0, len = Object.keys(transaction.getSenders()).length; i < len; i++) {
                    await this.insertAddressQuery(client, Object.keys(transaction.getSenders())[i], -transaction.getSenders()[Object.keys(transaction.getSenders())[i]], false, true, transaction.getTransactionID());
                }
                const FEES = await transaction.calculateFee();
                if(FEES !== 0) await this.insertAddressQuery(client, 'FEES', FEES, false, false, transaction.getTransactionID());
                await client.query('COMMIT');
                resolve(true);
            } catch(e) {
                await client.query('ROLLBACK');
                resolve(false);
            } finally {
                client.release();
            }
        });
    }


    /**
     * Used to compare the DB Block instance and the RPC Block instance.
     * 
     * Block Failure Codes:
     * MISMATCH_HEIGHT
     * MISMATCH_HASH
     * MISMATCH_VERSIONHEX
     * MISMATCH_BITS
     * MISMATCH_MERKLEROOT
     * MISMATCH_SIZE
     * MISMATCH_DIFF
     * 
     * @param {Number} blockHeight The height of the block.
     */
    public verifyBlock(rpcBlock: Block, dbBlock: Block) {
        return new Promise((resolve, reject) => {
            let blockCheck = rpcBlock.compareBlock(dbBlock);
            if(blockCheck !== 'CLEAN') return resolve (blockCheck);
            let rpcTransactions = rpcBlock.getTransactions();
            let checkedRpcTransactions = rpcBlock.getTransactions();
            let rejectedTransactions: Transaction[] = [];
            let dbTransactions = dbBlock.getTransactions();
            const expectFailure = rpcTransactions.length !== dbTransactions.length;

            _.forEach(dbTransactions, async (dbTransaction, i) => {
                let rpcTransaction = await _.find(rpcTransactions, (rpcElement) => {
                    if( rpcElement.getTransactionID() == dbTransaction.getTransactionID()){
                        checkedRpcTransactions = _.filter(checkedRpcTransactions, e => {return e.getTransactionID() != rpcElement.getTransactionID()});
                        return true;
                    }
                    return false;
                })
                if(rpcTransaction === undefined){
                    //Transaction is rejected.
                    //May be a double spend tx.
                    //rejectedTransactions.push(dbTransaction);
                    const client = await this.pool.connect();
                    await client.query('BEGIN');
                    try {
                        await this.rejectTransaction(dbTransaction, client, false, false);
                        await client.query('COMMIT');
                    } catch (e) {
                        await client.query('ROLLBACK');
                    } finally {
                        client.release();
                    }
                }else{
                    const client = await this.pool.connect();
                    await client.query('BEGIN');
                    try {
                        var checkTransaction = async () => {
                            let failed = false;
                            let code = '';
                            if(dbTransaction.getVersion() !== rpcTransaction.getVersion()){ failed = true; code = 'VERSION' };
                            if(dbTransaction.getSize() !== rpcTransaction.getSize()){ failed = true; code = 'SIZE' };
                            if(dbTransaction.getTotalRecieved() !== rpcTransaction.getTotalRecieved()){ failed = true; code = 'TOTAL_RECIEVED' };
                            if(dbTransaction.getTotalSent() !== rpcTransaction.getTotalSent()){ failed = true; code = 'TOTAL_SENT' };
                            if(dbTransaction.calculateFee() !== rpcTransaction.calculateFee()){ failed = true; code = 'FEE' };
                            if(dbTransaction.getTime() !== rpcTransaction.getTime()){ failed = true; code = 'TIME' };
                    
                            //Compare sender addresses and amounts;
                            const checkSenderAddresses = () => new Promise(resolve => {
                                if(failed) return resolve();
                                if(Object.keys(dbTransaction.getSenders()).length !== Object.keys(rpcTransaction.getSenders()).length){ failed = true; return resolve() };
                                _.forEach(Object.keys(dbTransaction.getSenders()), async (dbTransactionSenderAddress, y) => {
                                    if(dbTransaction.getSenders()[dbTransactionSenderAddress] !== rpcTransaction.getSenders()[dbTransactionSenderAddress]){ failed = true; code = `SENDERS-${i}` };
                                    if(y == Object.keys(dbTransaction.getSenders()).length - 1) {
                                        resolve();
                                    }
                                });
                            });
                            await checkSenderAddresses();
                            
                            //Compare sender addresses and amounts;
                            const checkReceiverAddresses = () => new Promise(resolve => {
                                if(failed) return resolve();
                                if(Object.keys(dbTransaction.getReceivers()).length !== Object.keys(rpcTransaction.getReceivers()).length){ failed = true; return resolve() };
                                _.forEach(Object.keys(dbTransaction.getReceivers()), async (dbTransactionSenderAddress, y) => {
                                    if(dbTransaction.getReceivers()[dbTransactionSenderAddress] !== rpcTransaction.getReceivers()[dbTransactionSenderAddress]){ failed = true; code = `Receivers-${i}` };
                                    if(y == Object.keys(dbTransaction.getReceivers()).length - 1) {
                                        resolve();
                                    }
                                });
                            });
                            if(!failed) await checkReceiverAddresses();
                            if(failed) dbTransaction.setFailureCode(code);
                            if(failed) await this.rejectTransaction(dbTransaction, client, false, false);
                            if(failed) dbTransactions[i] = rpcTransaction;
                            return true;
                        }

                        let checkRes = await checkTransaction();
                        await client.query('COMMIT');
                    } catch (e) {
                        await client.query('ROLLBACK');
                    } finally {
                        client.release();
                    }
                }
                if(i == dbTransactions.length - 1){
                    if(rejectedTransactions.length == 0 && checkedRpcTransactions.length == 0){
                        //Confirm all transactions & Block
                        const client = await this.pool.connect();
                        await client.query('BEGIN');
                        let updateFailed=false;
                        try {
                            await client.query("UPDATE blocks SET confirmed=true where height=$1", [dbBlock.getBlockHeight()]);
                            _.forEach(dbTransactions, async (dbTransaction:Transaction, i) => {
                                try {
                                    if(!updateFailed) await this.confirmTransaction(dbTransaction, client);
                                } catch (e) {
                                    updateFailed = true;
                                }
                                if(i == dbTransactions.length - 1){
                                    if(!updateFailed) await client.query('COMMIT');
                                    if(updateFailed)  await client.query('ROLLBACK');
                                }
                            });
                        } catch (e) {
                            await client.query('ROLLBACK');
                            reject();
                        } finally {
                            client.release();
                        }
                    }else{
                        //Either a new transaction or an orphaned transaction.
                    }
                    return resolve('CLEAN');
                }
            });
        });
    }


    /**
     * Used within interface_handler to confirm a series of transactions from a block. 
     * @param {Transaction} transaction The transaction to confirm.
     */
    public confirmTransaction(transaction: Transaction, poolClient: PoolClient) {
        return new Promise<object>(async (resolve, reject) => {
            try {
                const res = await poolClient.query("UPDATE transactions SET confirmed=true where transactionid=$1", [transaction.getTransactionID()]);
                for (var i = 0, len = Object.keys(transaction.getReceivers()).length; i < len; i++) {
                    await this.subtractAddressQuery(poolClient, Object.keys(transaction.getReceivers())[i], transaction.getReceivers()[Object.keys(transaction.getReceivers())[i]], false);
                    await this.insertAddressQuery(poolClient, Object.keys(transaction.getReceivers())[i], transaction.getReceivers()[Object.keys(transaction.getReceivers())[i]], true, false, transaction.getTransactionID());
                }
                for (var i = 0, len = Object.keys(transaction.getSenders()).length; i < len; i++) {
                    await this.subtractAddressQuery(poolClient, Object.keys(transaction.getSenders())[i], -transaction.getSenders()[Object.keys(transaction.getSenders())[i]], false);
                    await this.insertAddressQuery(poolClient, Object.keys(transaction.getSenders())[i], -transaction.getSenders()[Object.keys(transaction.getSenders())[i]], true, false, transaction.getTransactionID());
                }
                const FEES = await transaction.calculateFee();
                if(FEES !== 0) await this.subtractAddressQuery(poolClient, 'FEES', FEES, false);
                if(FEES !== 0) await this.insertAddressQuery(poolClient, 'FEES', FEES, true, false, transaction.getTransactionID());
                resolve([true, transaction]);
            } catch (e) {
                reject();
            }
        });
    }


    /**
     * Used within interface_handler to reject a series of transactions from a block.
     * @param {Transaction} transaction The transaction to reject.
     */
    public rejectTransaction(transaction: Transaction, poolClient: PoolClient, isConfirmed: boolean, isMempool: boolean) {
        let poolClientPassed = true;
        if(!poolClient) poolClientPassed = false;
        return new Promise<object>(async (resolve, reject) => {
            try {
                if(!poolClient) {
                    poolClient = await this.pool.connect();
                    await poolClient.query('BEGIN');
                }
                let classToDelete = isMempool ? 'mempooltransactions' : 'transactions';
                await poolClient.query('INSERT INTO rejectedtransactions(transactionid, version, size, totalsent, totalrecieved, totalfee, senders, receivers, time, confirmed, height, isMempool) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', [transaction.getTransactionID(), transaction.getVersion(), transaction.getSize(), transaction.getTotalSent(), transaction.getTotalRecieved(), transaction.calculateFee(), transaction.getSenders(), transaction.getReceivers(), transaction.getTime(), isConfirmed, transaction.getHeight(), isMempool]);
                await poolClient.query(`DELETE from ${classToDelete} where transactionid = $1`, [transaction.getTransactionID()]);
                for (var i = 0, len = Object.keys(transaction.getReceivers()).length; i < len; i++) {
                    await this.subtractAddressQuery(poolClient, Object.keys(transaction.getReceivers())[i], transaction.getReceivers()[Object.keys(transaction.getReceivers())[i]], isConfirmed);
                }
                for (var i = 0, len = Object.keys(transaction.getSenders()).length; i < len; i++) {
                    await this.subtractAddressQuery(poolClient, Object.keys(transaction.getSenders())[i], -transaction.getSenders()[Object.keys(transaction.getSenders())[i]], isConfirmed);
                }
                const FEES = await transaction.calculateFee();
                if(FEES !== 0) await this.subtractAddressQuery(poolClient, 'FEES', FEES, false);
                if(!poolClientPassed) poolClient.query('COMMIT');
                resolve([true, transaction]);
            } catch (e) {
                await poolClient.query('ROLLBACK');
                reject();
            } finally {
                if(!poolClientPassed) poolClient.release();
            }
        });
    }

    /**
     * Used to subtract from an address a specific amount, used primarily to reverse a transaction or to confirm a transaction.
     * If it fails, the balance would be negative the query went through.
     * A negative balance would be reversing a previous transaction involving currency being sent.
     * If the isConfirmed is true, the balance will be subtracted from confirmed, else from unconfirmed.
     * @param {PoolClient} poolClient The current pool client for correct transaction isolation.
     * @param {String} address The address to subtract from.
     * @param {Number} balance The balance to subtract from the address. If negative, reversing a sent balance update ei (NEWCOIN).
     * @param {boolean} isConfirmed If the balance is already confirmed or unconfirmed.
     */
    public async subtractAddressQuery(poolClient:PoolClient, address:string, balance:number, isConfirmed:boolean){
        return new Promise<object>(async (resolve, reject) => {
            const confirmedBalance = isConfirmed ? balance : 0;
            const unconfirmedBalance = !isConfirmed? balance : 0;
            const isSent = balance >= 0 ? false : true; 
            const totalsent = isSent ? confirmedBalance : 0;
            const totalreceived = !isSent ? confirmedBalance : 0;
            const res = await poolClient.query("UPDATE addresses SET confirmed = confirmed - $2, unconfirmed = unconfirmed - $3, totalreceived = totalreceived - $4, totalsent = totalsent - $5 where address=$1", [address, confirmedBalance, unconfirmedBalance, totalreceived, totalsent]);
            resolve();
        });
    }

    
    /**
     * Used to get a block instance from the database.
     * @param {Number} blockHeight The height of the block.
     */
    public async getBlock(blockHeight: number){
        return new Promise<Block>(async (resolve, reject) => {
            try {
                this.getDatabaseHeight().then(async (dbHeight) => {
                    const res = await this.pool.query('SELECT * from blocks where height = $1', [blockHeight]);
                    let blockDB = res.rows[0];
                    
                    let newBlock = new Block(blockHeight, blockDB.hash, parseInt(blockDB.size), parseInt(blockDB.version), blockDB.versionhex, blockDB.merkleroot, parseInt(blockDB.time), parseInt(blockDB.nonce), blockDB.chainwork, blockDB.bits, parseFloat(blockDB.diff), Math.abs(blockHeight - dbHeight));
                    for(let i = 0, len = res.rows[0].transactions.length; i < len; i++){
                        //Get transaction data
                        const tx = await this.pool.query('SELECT * from transactions where transactionid = $1', [res.rows[0].transactions[i]]);
                        //Create Transaction
                        let newTransaction = new Transaction(tx.rows[0].transactionid, parseInt(tx.rows[0].version), parseInt(tx.rows[0].size), parseInt(tx.rows[0].time), blockHeight);
                        //Add senders
                        for(let x = 0, lenx = Object.keys(tx.rows[0].senders).length; x < lenx; x++){
                            newTransaction.addSender(Object.keys(tx.rows[0].senders)[x], tx.rows[0].senders[Object.keys(tx.rows[0].senders)[x]]);
                            if(x == lenx - 1) {
                                //Add Receivers
                                for(let y = 0, leny = Object.keys(tx.rows[0].receivers).length; y < leny; y++){
                                    newTransaction.addReciever(Object.keys(tx.rows[0].receivers)[y], tx.rows[0].receivers[Object.keys(tx.rows[0].receivers)[y]]);
                                    if(y == leny - 1) {
                                        newBlock.addTransaction(newTransaction);
                                        if(i == len - 1){
                                            resolve(newBlock);
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            } catch (e) {
                reject(e);
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


    public getUnconfirmedBlocks(latestHeight:number):Promise<Array<any>>{
        return new Promise<Array<any>>(async (resolve, reject) => {
            try {
                const res = await this.pool.query('SELECT height from blocks where confirmed=false and height <= $1;', [latestHeight - 3]);
                if(res.rows.length == 0) return resolve(null);
                resolve(res.rows);
            } catch (e) {
                resolve([-1]);
            }
        });
    }

    public async insertInvoiceAddress(address:string, invoiceid:any) {
        const client = await this.pool.connect();
            await client.query('BEGIN');
        try {
            await client.query('INSERT INTO addresses(address, confirmed, unconfirmed, totalreceived, totalsent, created, events) VALUES($1, 0, 0, 0, 0, now(), $2)', [address, invoiceid]);
            await client.query('COMMIT');
            return true;
        } catch (e) {
            await client.query('ROLLBACK');
            return false;
        } finally {
            client.release();
        }
    }

    public async saveFailedTransactionUpdate(data:any, error:string) {
        const client = await this.pool.connect();
            await client.query('BEGIN');
        try {
            await client.query('INSERT INTO failedtransactionupdates(data, error,  time) VALUES($1, $2, now())', [data, error]);
            await client.query('COMMIT');
        } catch (e) {
            console.log(e, "ERROR");
            await client.query('ROLLBACK');
        } finally {
            client.release();
        }
        return true;
    }

}

