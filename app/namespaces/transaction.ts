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
        time: 0,
        height: -1,
        senders: {},
        receivers: {},
        opreturns: [],
        failureCode: ""
    }
    


    constructor(txid: string, version: number, size: number, time: number, height: number){
        this.dataObject.transactionID = txid;
        this.dataObject.version = version;
        this.dataObject.size = size;
        this.dataObject.time = time;
        this.dataObject.height = height;
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
        if(this.dataObject.receivers[address] === undefined){
            this.dataObject.receivers[address] = amount;
        }else{
            this.dataObject.receivers[address] += amount;
        }
    }


    /**
     * Adds Hex Data to the transaction
     * @param hex Hex Data
     */
    public addOpReturn(hex:string):void {
        this.dataObject.opreturns.push({hex: hex, text: this.convertHex(hex)});
    }

    private convertHex(hex:string):string {
        var hex = hex.toString();//force conversion
        var str = '';
        for (var i = 0; (i < hex.length && hex.substr(i, 2) !== '00'); i += 2)
            str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        return str;
    }

    public setFailureCode(failureCode:string){
        this.dataObject.failureCode = failureCode;
    }

    /*
     ------------- Get functions -------------
    */

    public getFailureCode() {
        return this.dataObject.failureCode;
    }

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
     * Used to change the transaction ID when testing rejected transactions.
     */
    public setTransactionID(txid:string) {
        this.dataObject.transactionID = txid;
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
     * Returns the time of the transaction.
     */
    public getTime():number {
        return this.dataObject.time;
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

    /**
     * Returns senders dom object, contains address as key and amount as value.
     */
    public getSenders():any {
        return this.dataObject.senders;
    }

    /**
     * Returns receivers dom object, contains address as key and amount as value.
     */
    public getReceivers():any {
        return this.dataObject.receivers;
    }

    /**
     * Returns the block height of the transaction.
     * Will return -1 if in mempool.
     */
    public getHeight():number {
        return this.dataObject.height;
    }
    
    /**
     * Returns the OP Return object
     */
    public getOPReturns():any {
        return this.dataObject.opreturns;
    }

    /**
     * Returns the OP Return values
     */
    public getOPReturnValues():any {
        if(this.dataObject.opreturns.length == 0) return [];
        return this.dataObject.opreturns.map(item => item.text);
    }
    /**
     * Converts the dataObject to a json string.
     */
    public toJSON():string {
        this.calculateFee();
        return JSON.stringify(this.dataObject)
    }
}