import {sync_manager} from './namespaces/sync_manager';
import {interface_handler} from './rpc_interface/interface_handler';
import {database_handler} from './postgres/database_handler';
import {confirmed_deposit, unconfirmed_deposit, confirmed_withdraw, unconfirmed_withdraw, mempool_deposit, mempool_withdraw} from './events';


const confirmed_deposit_event = new confirmed_deposit();
const unconfirmed_deposit_event = new unconfirmed_deposit();
const confirmed_withdraw_event = new confirmed_withdraw();
const unconfirmed_withdraw_event = new unconfirmed_withdraw();
const mempool_deposit_event = new mempool_deposit();
const mempool_withdraw_event = new mempool_withdraw();

var rpc = new interface_handler();
var database = new database_handler('postgres', 'Password123', 'localhost', 5432, 'aucrypto', confirmed_deposit_event, unconfirmed_deposit_event, confirmed_withdraw_event, unconfirmed_withdraw_event, mempool_deposit_event, mempool_withdraw_event);
var sync = new sync_manager(rpc, database, confirmed_deposit_event, unconfirmed_deposit_event, confirmed_withdraw_event, unconfirmed_withdraw_event, mempool_deposit_event, mempool_withdraw_event);

sync.startFullSync();