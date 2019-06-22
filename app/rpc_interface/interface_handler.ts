var bitcoin_rpc = require('node-bitcoin-rpc');
var zmq = require('zmq')
var sock = zmq.socket('sub');
import {Block} from '../namespaces/block';
import {Transaction} from '../namespaces/transaction';
import {database_handler} from '../postgres/database_handler';

export class interface_handler{


    private database:database_handler;
    public blockHeight:number;
    constructor(){
        const user = 'NOGdLCSui8';
        const pass = 'yOKFop6v7IjFwvr7uDVGbQ';
        const port = 18339;
        const host = '0.0.0.0';
        bitcoin_rpc.init(host, port, user, pass);
    }


    /**
     * Start listening to mempool transactions.
     */
    public async startMempoolListen(database:database_handler) {
        this.database = database;
        var self = this;
        sock.connect('tcp://127.0.0.1:29000');
        sock.on('message', async function(topic:string, message:any) {
            //Decode
            bitcoin_rpc.call('decoderawtransaction', [message.toString('hex')], async function (err:any, res:any) {
              if(res.error == null) {
                    //Convert to transaction instance
                    let newTransaction = new Transaction(res.result.txid, res.result.version, res.result.size, new Date().getTime(), self.blockHeight + 1);
                    //Loop through receievers
                    for(var it = 0, lent = res.result.vout.length; it < lent; it++){
                        if(res.result.vout[it].scriptPubKey.type !== 'nulldata') newTransaction.addReciever(res.result.vout[it].scriptPubKey.addresses[0], res.result.vout[it].value);
                        if(it == lent - 1) for(var i = 0, lena = res.result.vin.length; i < lena; i++){
                            if(res.result.vin[i].coinbase !== undefined){
                                newTransaction.addSender('NEWCOINS', newTransaction.getTotalRecieved());
                                if(i + 1 == lena){
                                    await database.insertMemPoolTransactionQuery(newTransaction);
                                }
                            }else{
                                await self.getSenderAddressANDAmount(res.result.vin[i].txid, res.result.vin[i].vout).then(async result => {
                                    newTransaction.addSender(result["address"], result["amount"]);
                                    if(i + 1 == lena){
                                        await database.insertMemPoolTransactionQuery(newTransaction);
                                    }
                                });
                            }
                        }
                    }
              }else{
                  console.log("ERROR", res, err);
              }
            });
        });
        sock.subscribe('rawtx');
    }

    /**
     * Get block current block height from the digital currency RPC.
     * @returns {Promise<Number>} The promise resolves the block height.
     */
    public async getBlockCount():Promise<number> {
        return new Promise<number>(resolve => {
            bitcoin_rpc.call('getblockcount', [], function (err:any, res:any) {
                if (err !== null) {
                    resolve(-1);
                } else {
                    resolve(res.result);
                }
            });
        });
    }

    /**
     * Retrieve block from digital currency RPC and assign to Block type DOM.
     * @param {number} blockHeight The block height to load.
     * @returns {Promise<Block>} The promise resolves with the Block instance.
     */
    public async getBlock(blockHeight: number):Promise<Block> {
        var self = this;
        return new Promise<Block>(async (resolve, reject) => {
            // Retreive the block hash for the block Height.
            try {
            await bitcoin_rpc.call('getblockhash', [blockHeight], async function (err:any, res:any) {
                if (err !== null || res.result === null) return reject();
                //Retrieve the block data from the hash.
                await bitcoin_rpc.call('getblock', [res.result, 1], async function (err:any, res:any) {
                    //Map to a block class instance.
                    if (err !== null || res.result === null) return reject();
                    let newBlock = new Block(blockHeight, res.result.hash, res.result.size, res.result.version, res.result.versionHex, res.result.merkleroot, res.result.time, res.result.nonce, res.result.chainwork, res.result.bits, res.result.difficulty, res.result.confirmations);
                    let txCounter = 0;
                    for (var icounter = 0, len = res.result.tx.length; icounter < len; icounter++) {
                        //Lookup raw transaction
                        await bitcoin_rpc.call('getrawtransaction', [res.result.tx[icounter], 1], async function (err:any, res:any) {
                            if (err !== null || res.result == null) return reject();  
                            let newTransaction = new Transaction(res.result.txid, res.result.version, res.result.size, res.result.time, blockHeight);
                            //Loop through receievers
                            for(var it = 0, lent = res.result.vout.length; it < lent; it++){
                                if(res.result.vout[it].scriptPubKey.type !== 'nulldata') newTransaction.addReciever(res.result.vout[it].scriptPubKey.addresses[0], res.result.vout[it].value);
                                if(it == lent - 1) for(var i = 0, lena = res.result.vin.length; i < lena; i++){
                                    if(res.result.vin[i].coinbase !== undefined){
                                        newTransaction.addSender('NEWCOINS', newTransaction.getTotalRecieved());
                                        if(i + 1 == lena){
                                            await newBlock.addTransaction(newTransaction);
                                            txCounter++;
                                        }
                                        if(txCounter == len) resolve(newBlock);
                                    }else{
                                        await self.getSenderAddressANDAmount(res.result.vin[i].txid, res.result.vin[i].vout).then(async result => {
                                            newTransaction.addSender(result["address"], result["amount"]);
                                            if(i + 1 == lena){
                                                await newBlock.addTransaction(newTransaction);
                                                txCounter++;
                                            }
                                            if(txCounter == len) resolve(newBlock);
                                        });
                                    }
                                }
                            }
                        });
                    } 
                });
            });
            } catch (e) {
                return reject();
            }
        });
    }

    /**
     * Private functions used within getBlock() to get the vin sender address and relevant amount.
     * @param {String} txid The transaction ID the address is wihtin.
     * @param {Number} vout The vout index of that transaction to select the address.
     */
    private async getSenderAddressANDAmount(txid:string, vout:number) {
        var self = this;
        return new Promise<any>((resolve, reject) => {
            bitcoin_rpc.call('getrawtransaction', [txid, 1], async function (err:any, resa:any) {
                if(err !== null){
                     setTimeout(function(){
                        resolve(self.getSenderAddressANDAmount(txid, vout));
                     }, 100);
                }else{
                    resolve({address: resa.result.vout[vout].scriptPubKey.addresses[0], amount: resa.result.vout[vout].value});
                }
            });
        });
    }


    public async confirmBlock(blockid: number, requiredConfirmations: number): Promise<boolean>{
        await this.getBlock(blockid).then(block_i => {
            if(block_i.getBlockConfirmations() < requiredConfirmations) return false;
            
        }); 
        return true;
    }

     /**
     * Get block current block height from the digital currency RPC.
     * @returns {Promise<string>} The promise resolves the block height.
     */
    public async getNewAddress(invoiceID:string):Promise<string> {
        return new Promise<string>(resolve => {
            bitcoin_rpc.call('getnewaddress', [], function (err:any, res:any) {
                if (err !== null) {
                    resolve('a');
                } else {
                    let address = res.result;
                    bitcoin_rpc.call('setaccount', [res.result, `INV${invoiceID}`], function (err:any, res:any) {
                        if (err !== null) {
                            resolve('a');
                        } else {
                            resolve(address);
                        }
                    });
                }
            });
        });
    }


}