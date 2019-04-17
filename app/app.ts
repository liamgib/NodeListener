import {Block} from './namespaces/block';
import {Transaction} from './namespaces/transaction';
import {interface_handler} from './rpc_interface/interface_handler';
var rpc = new interface_handler();
rpc.getBlockCount().then(blockCount => {
   // console.log(blockCount);
})

console.time('A');
rpc.getBlock(235618).then(blockCount => {
    console.timeEnd('A');
    console.log(blockCount,blockCount.Transactions[1]);
})

var new_block = new Block(100, "ahdhf", 12, 1, "01f1", "dfdfdfmerkle", 1384583, 1, "datchainwork");
//console.log("Aye", new_block.toJSON());

var new_transaction = new Transaction("txid", 1, 100);
new_transaction.addSender("ajihedfdf", 10.00);
new_transaction.addSender("ajihedfdf", 12.1);
new_transaction.addSender("NEW_COINS", 50);
new_transaction.addReciever("reciever", 71.04545812)
//console.log(new_transaction.toJSON());