/**
 * Event classed used as a base type for any event registered.
 * @author Liam Gibson
 */

 /**  
  * Planned Events:
  * CONFIRMED_DEPOSIT
  * UNCONFIRMED_DEPOSIT
  * CONFIRMED_WITHDRAW
  * UNCONFIRMED_WITHDRAW
  */

 export class Event {
    private subscribers:any = [];


    public async addSubscriber(callback: Function){
        let unique_identifier = Date.now() + Math.random();
        this.subscribers.push({identifier: unique_identifier, event: callback});
    }

    public async triggerEvent(data: any){
        for(let i = 0; i < this.subscribers.length; i++){
            this.subscribers[i].event({ID: this.subscribers[i].identifier, data: data});
        }
    }
 }