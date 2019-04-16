/**
 * The purpose of this class is to define a method of interacting with/and transaction data from a digital currency.
 */
export class Transaction {
    private dataObject = {
        transactionID: "txid",
        version: 0,
        size: 0
    }

    constructor(txid: string, version: number, size: number){
        this.dataObject.transactionID = txid;
        this.dataObject.version = version;
        this.dataObject.size = size;
    }

    /**
     * Returns the transaction ID as the identifer.
     */
    public getTransactionID():string {
        return this.dataObject.transactionID;
    }

    /**
     * Returns the version number.
     */
    public getVersion():number {
        return this.dataObject.version;
    }

    /**
     * Returns the size of the transaction.
     */
    public getSize():number {
        return this.dataObject.size;
    }
}