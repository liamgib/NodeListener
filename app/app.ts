import {Block} from './namespaces/block';
import {interface_handler} from './rpc_interface/interface_handler';
var rpc = new interface_handler();
rpc.getBlockCount().then(blockCount => {
    console.log(blockCount);
})

rpc.getBlock(100).then(blockCount => {
    console.log(blockCount);
})
var new_block = new Block(100, "ahdhf", 12, 1, "01f1", "dfdfdfmerkle", 1384583, 1, "datchainwork");
console.log("Aye", new_block.toJSON());