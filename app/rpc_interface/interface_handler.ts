declare function require(name:string);
var bitcoin_rpc = require('node-bitcoin-rpc')
import {Block} from '../namespaces/block';
import {Transaction} from '../namespaces/transaction';


export class interface_handler{

    constructor(){
        bitcoin_rpc.init('0.0.0.0', 18339, 'NOGdLCSui8', 'yOKFop6v7IjFwvr7uDVGbQ')
    }


    /**
     * Get block current block height from the digital currency RPC.
     * @returns {Promise<Number>} The promise resolves the block height.
     */
    public async getBlockCount():Promise<number> {
        return new Promise<number>(resolve => {
            bitcoin_rpc.call('getblockcount', [], function (err, res) {
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
            await bitcoin_rpc.call('getblockhash', [blockHeight], async function (err, res) {
                if (err !== null || res.result === null) return reject();
                //Retrieve the block data from the hash.
                await bitcoin_rpc.call('getblock', [res.result, 1], async function (err, res) {
                    //Map to a block class instance.
                    if (err !== null || res.result === null) return reject();
                    let newBlock = new Block(blockHeight, res.result.hash, res.result.size, res.result.version, res.result.versionHex, res.result.merkleroot, res.result.time, res.result.nonce, res.result.chainwork, res.result.bits, res.result.difficulty, res.result.confirmations);
                    let txCounter = 0;
                    for (var icounter = 0, len = res.result.tx.length; icounter < len; icounter++) {
                        //Lookup raw transaction
                        await bitcoin_rpc.call('getrawtransaction', [res.result.tx[icounter], 1], async function (err, res) {
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
        return new Promise<Object>((resolve, reject) => {
            bitcoin_rpc.call('getrawtransaction', [txid, 1], async function (err, resa) {
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

    public async confirmBlocks(requiredConfirmations: number) {

    }


}