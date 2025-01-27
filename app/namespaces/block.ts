/**
 * The purpose of this class is to define a standard to interact with digital currency block data. 
 */
import {Transaction} from './transaction';
 export class Block {
    private dataObject = {
        blockHeight: 0,
        blockHash: "hash",
        blockSize: 0,
        blockVersion: 0,
        blockVersionHex: "versionHex",
        blockMerkleRoot: "merkleRoot",
        blockTime: 0,
        blockNonce: 0,
        blockDiff: 0.00,
        blockBits: "bits",
        blockChainwork: "chainwork",
        blockConfirmations: 0,
        totalSentBlock: 0,
        totalRecievedBlock: 0,
        totalFeeBlock: 0
    };

    private Transactions: Array<Transaction> = [];

    constructor(height: number, hash: string, size: number, version: number, versionHex: string, merkleRoot: string, time: number, nonce: number, chainwork: string, bits: string, diff: number, confirmations: number){
        this.dataObject.blockHeight = height;
        this.dataObject.blockHash = hash;
        this.dataObject.blockSize = size;
        this.dataObject.blockVersion = version;
        this.dataObject.blockVersionHex = versionHex;
        this.dataObject.blockMerkleRoot = merkleRoot;
        this.dataObject.blockTime = time;
        this.dataObject.blockNonce = nonce;
        this.dataObject.blockChainwork = chainwork;
        this.dataObject.blockBits = bits;
        this.dataObject.blockDiff = diff;
        this.dataObject.blockConfirmations = confirmations;
    }


    /** 
     * Adds completed transaction instance to the block.
     * @param transaction The relevant transaction instance.
     */
    public addTransaction(transaction:Transaction):void {
        this.dataObject.totalRecievedBlock += transaction.getTotalRecieved();
        this.dataObject.totalSentBlock += transaction.getTotalSent();
        this.dataObject.totalFeeBlock += transaction.calculateFee();
        this.Transactions.push(transaction);
    }

    /*
     ------------- Get functions -------------
    */

    /**
     * The height of this block.
     */
    public getBlockHeight():number {
        return this.dataObject.blockHeight;
    }

    /**
     * (Hash of the blocks header) to reference to a block.
     */
    public getBlockHash():string {
        return this.dataObject.blockHash;
    }
    
    /**
     * The block size in bytes.
     */
    public getBlockSize():number {
        return this.dataObject.blockSize;
    }

    /** 
     * The version of the block.
    */
    public getBlockVersion():number {
        return this.dataObject.blockVersion;
    }

    /**
     * The version of the block in hex format.
     */
    public getBlockVersionHex():string {
        return this.dataObject.blockVersionHex;
    }

    /**
     * Hash of all the transactions within the block.
     */
    public getBlockMerkleRoot():string {
        return this.dataObject.blockMerkleRoot;
    }

    /**
     * The time of block creation.
     */
    public getBlockTime():number {
        return this.dataObject.blockTime;
    }

    /**
     * The nonce of the block.
     */
    public getBlockNonce():number {
        return this.dataObject.blockNonce;
    }

    /**
     *  Expected number of hashes required to produce the chain up to this block
     */
    public getBlockChainwork():string {
        return this.dataObject.blockChainwork;
    }

    /**
     *  The difficulty of the block at the time mined.
     */
    public getBlockDifficulty():Number {
        return this.dataObject.blockDiff;
    }

    /**
     *  The 'Bits' of the block, used for mining.
     */
    public getBlockBits():string {
        return this.dataObject.blockBits;
    }

    /**
     * The confirmations of the block, should just be the x amount of blocks since this block height.
     * Just good to double check on confirmation.
     */
    public getBlockConfirmations():number {
        return this.dataObject.blockConfirmations;
    }

    /**
     * Retrieve the total sent within the block.
     */
    public getTotalSent():number {
        return this.dataObject.totalSentBlock;
    }

    /**
     * Retrieve the total recieved within the block.
     */
    public getTotalRecieved():number {
        return this.dataObject.totalRecievedBlock;
    }

    /**
     * Retrieve the total fee within the block.
     */
    public getTotalFee():number {
        return this.dataObject.totalFeeBlock;
    }

    /**
     * Retrieve all transactions within this block.
     */
    public getTransactions():Array<Transaction> {
        return this.Transactions;
    }



    /**
     * Used to compare all block relevant information.
     * Will not check totalBalances or transaction data.
     * @param otherBlock Block to compare with
     * @returns The reason for the failure, otherwise 'CLEAN'
     */
    public compareBlock(otherBlock: Block):String {
        if(this.getBlockHeight() !== otherBlock.getBlockHeight()) return 'MISMATCH_HEIGHT';
        if(this.getBlockHash() !== otherBlock.getBlockHash()) return 'MISMATCH_HASH';
        if(this.getBlockVersionHex() !== otherBlock.getBlockVersionHex()) return 'MISMATCH_VERSIONHEX';
        if(this.getBlockBits() !== otherBlock.getBlockBits()) return 'MISMATCH_BITS';
        if(this.getBlockMerkleRoot() !== otherBlock.getBlockMerkleRoot()) return 'MISMATCH_MERKLEROOT';
        if(this.getBlockSize() !== otherBlock.getBlockSize()) return 'MISMATCH_SIZE';
        if(this.getBlockDifficulty() !== otherBlock.getBlockDifficulty()) return 'MISMATCH_DIFF';
        if(this.getBlockTime() !== otherBlock.getBlockTime()) return 'MISMATCH_TIME';
        return 'CLEAN';
    }


    /**
     * Converts the dataObject to a json string.
     */
    public toJSON():string {
        return JSON.stringify(this.dataObject)
    }

    public getTransactionsJSON():string {
        let transactions: Array<string> = [];
        for(let i = 0, len = this.Transactions.length; i < len; i++){
            transactions.push(this.Transactions[i].getTransactionID());
            if(i == len - 1){
                return JSON.stringify(transactions);
            }
        }
    }




}