declare function require(name:string);
var bitcoin_rpc = require('node-bitcoin-rpc')
import {Block} from '../namespaces/block';
import {Transaction} from '../namespaces/transaction';


export class interface_handler{

    constructor(){
        bitcoin_rpc.init('0.0.0.0', 18339, 'NOGdLCSui8', 'yOKFop6v7IjFwvr7uDVGbQ')
    }

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

    public async getBlock(blockHeight: number):Promise<Block> {
        var self = this;
        return new Promise<Block>(async (resolve, reject) => {
            // Retreive the block hash for the block Height.
            await bitcoin_rpc.call('getblockhash', [blockHeight], async function (err, res) {
                if (err !== null) {
                    reject();
                } else {
                    //Retrieve the block data from the hash.
                    await bitcoin_rpc.call('getblock', [res.result, 1], async function (err, res) {
                        //Map to a block class instance.
                        if (err !== null) {
                            reject();
                        } else {
                            let newBlock = new Block(blockHeight, res.result.hash, res.result.size, res.result.version, res.result.versionHex, res.result.merkleroot, res.result.time, res.result.nonce, res.result.chainwork);
                            let icounter = 0;
                            for (var i = 0, len = res.result.tx.length; i < len; i++) {
                                //Lookup raw transaction
                                await bitcoin_rpc.call('getrawtransaction', [res.result.tx[i], 1], async function (err, res) {
                                    if (err !== null) {
                                        reject();
                                    } else {  
                                        let newTransaction = new Transaction(res.result.txid, res.result.version, res.result.size);
                                        //Loop through receievers
                                        let itcounter = 0;
                                        for(var it = 0, lent = res.result.vout.length; it < lent; it++){
                                            
                                            if(res.result.vout[it].scriptPubKey.type !== 'nulldata'){
                                                newTransaction.addReciever(res.result.vout[it].scriptPubKey.addresses[0], res.result.vout[it].value);
                                            }
                                            //Last output
                                            itcounter++;
                                            if(itcounter == lent){
                                                //Loop through senders
                                                var lena = res.result.vin.length, i = 0;
                                                for(i; i < lena; i++){
                                                    if(res.result.vin[i].coinbase !== undefined){
                                                        newTransaction.addSender('NEWCOINS', newTransaction.getTotalRecieved());
                                                        if(i + 1 == lena){
                                                            newBlock.addTransaction(newTransaction);
                                                            icounter++;
                                                            if(icounter == len){
                                                                resolve(newBlock);
                                                            }
                                                        }
                                                    }else{
                                                        await self.getSenderAddressANDAmount(res.result.vin[i].txid, res.result.vin[i].vout, i, lena).then(result => {
                                                            newTransaction.addSender(result["address"], result["amount"]);
                                                            if(result["index"] + 1 == result["max"]){
                                                                newBlock.addTransaction(newTransaction);
                                                                icounter++;
                                                                if(icounter == len){
                                                                    resolve(newBlock);
                                                                }
                                                            }
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                });
                            } 
                        }  
                    });
                }
            });
        });
    }

    public async getSenderAddressANDAmount(txid:string, vout:number, i:number, max:number) {
        var self = this;
        return new Promise<Object>((resolve, reject) => {
            bitcoin_rpc.call('getrawtransaction', [txid, 1], async function (err, resa) {
                if(err !== null){
                     setTimeout(function(){
                        resolve(self.getSenderAddressANDAmount(txid, vout, i, max));
                     }, 100);
                }else{
                    resolve({index: i, max: max, address: resa.result.vout[vout].scriptPubKey.addresses[0], amount: resa.result.vout[vout].value});
                }
            });
        });
    }


}