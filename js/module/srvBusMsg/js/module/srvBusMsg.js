
const generateHash = new Date().getTime()*Math.random();

const getStrOrErr = (key, val) => {
    return (typeof val == 'string') ? val : new Error(`${key} must be a string`);
}

const getArrOrErr = (key, arr) => {
    return Array.isArray(arr) ? arr : new Error(`${key} must be an array`);
}

/**
 * @class
 * Сообщение, предназначенное для передачи по шине фреймворка
 */
class BusMsg_S {
    constructor({ topic, payload: { com, arg=[], source, destinations } }) {
        this.topic =  getStrOrErr('topic', topic),
        this.payload = {
            timestamp: new Date().getTime(),
            hash:         generateHash(),                //// TODO: использовать библиотечную функцию
            com:          getStrOrErr('com', com),
            arg:          getArrOrErr('arg', arg),
            source:       getStrOrErr('source', source),
            destinations: getArrOrErr('destinations', destinations),
        }
    }
}

module.exports = { BusMsg: BusMsg_S, HrzBusReq };