/**
 * The purpose of this class is to define a method of interacting with/and transaction data from a digital currency.
 */
export class Transaction {
    private dataObject = {
        transactionID: "txid",
        version: 0,
        size: 0,
        totalSent: 0,
        totalRecieved: 0,
        totalFee: 0,
        senders: {},
        recievers: {}
    }
    


    constructor(txid: string, version: number, size: number){
        this.dataObject.transactionID = txid;
        this.dataObject.version = version;
        this.dataObject.size = size;
    }



    /**
     * Adds sender with the amount, use 'NEWCOINS' if it is newly mined.
     * @param address The relevant sender address.
     * @param amount The amount in the address sent in floating point format.
     */
    public addSender(address:string, amount:number):void {
        this.dataObject.totalSent += amount;
        if(this.dataObject.senders[address] === undefined){
            this.dataObject.senders[address] = amount;
        }else{
            this.dataObject.senders[address] += amount;
        }
    }

    /**
     * Adds reciever address with the relevant amount recieved.
     * @param address The relevant sender address.
     * @param amount The amount in the address sent in floating point format.
     */
    public addReciever(address:string, amount:number):void {
        this.dataObject.totalRecieved += amount;
        if(this.dataObject.recievers[address] === undefined){
            this.dataObject.recievers[address] = amount;
        }else{
            this.dataObject.recievers[address] += amount;
        }
    }



    /*
     ------------- Get functions -------------
    */

    /** 
     * Will calculate the fee from the discrepancy between total sent and recieved.
     * The fee will also be added to the dom.
     * @returns The transaction fee.
     */
    public calculateFee(): number {
        this.dataObject.totalFee = this.dataObject.totalSent - this.dataObject.totalRecieved;
        return this.dataObject.totalFee;
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

    /**
     * Returns the total amount sent in this transaction.
     */
    public getTotalSent():number {
        return this.dataObject.totalSent;
    }

    /**
     * Returns the total amount recieved in this transaction.
     */
    public getTotalRecieved():number {
        return this.dataObject.totalRecieved;
    }

    public getSenders():object {
        return this.dataObject.senders;
    }

    public getRecievers():object {
        return this.dataObject.recievers;
    }
    
    /**
     * Converts the dataObject to a json string.
     */
    public toJSON():string {
        this.calculateFee();
        return JSON.stringify(this.dataObject)
    }
}