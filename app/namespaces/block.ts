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
        blockChainwork: "chainwork",
        totalSentBlock: 0,
        totalRecievedBlock: 0,
        totalFeeBlock: 0
    };

    private Transactions: Array<Transaction> = [];

    constructor(height: number, hash: string, size: number, version: number, versionHex: string, merkleRoot: string, time: number, nonce: number,  chainwork: string){
        this.dataObject.blockHeight = height;
        this.dataObject.blockHash = hash;
        this.dataObject.blockSize = size;
        this.dataObject.blockVersion = version;
        this.dataObject.blockVersionHex = versionHex;
        this.dataObject.blockMerkleRoot = merkleRoot;
        this.dataObject.blockTime = time;
        this.dataObject.blockNonce = nonce;
        this.dataObject.blockChainwork = chainwork;
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
     * Converts the dataObject to a json string.
     */
    public toJSON():string {
        return JSON.stringify(this.dataObject)
    }




}