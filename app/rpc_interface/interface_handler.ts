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
        return new Promise<Block>((resolve, reject) => {
            // Retreive the block hash for the block Height.
            bitcoin_rpc.call('getblockhash', [blockHeight], function (err, res) {
                if (err !== null) {
                    reject();
                } else {
                    //Retrieve the block data from the hash.
                    bitcoin_rpc.call('getblock', [res.result, 1], function (err, res) {
                        //Map to a block class instance.
                        if (err !== null) {
                            reject();
                        } else {
                            let newBlock = new Block(blockHeight, res.result.hash, res.result.size, res.result.version, res.result.versionHex, res.result.merkleroot, res.result.time, res.result.nonce, res.result.chainwork);
                            resolve(newBlock);
                        }
                        
                    });
                }
            });
        });
    }
}