/** КОНСТАНТЫ */
const MSG_TYPE_EVENT    = 'event';     // стандартное сообщение, не требующее ответа
const MSG_TYPE_REQUEST  = 'req';         // запрос, ответ на который будет ожидаться посредством async-await
const MSG_TYPE_RESPONSE = 'res';        // ответ
const MSG_TYPE_LIST = [MSG_TYPE_EVENT, MSG_TYPE_REQUEST, MSG_TYPE_RESPONSE]; 
/************ */
const generateHash = () => new Date().getTime()*Math.random();

/**
 * @typedef TypeBusMsgConstructor
 * @property {string} com
 * @property {[]} arg
 * @property {} value 
 */
/**
 * @class
 * Сообщение, предназначенное для передачи по шине фреймворка
 */
class ClassBusMsg_S {
    /**
     * @constructor
     * @param {TypeBusMsgConstructor} _msg 
     */
    constructor({ topic, payload: { com, arg=[], value, source, destinations, type } }) {
        this.topic =  this.#GetStrOrErr('topic', topic),
        this.payload = {
            timestamp: new Date().getTime(),
            hash:         generateHash(),                // TODO: использовать библиотечную функцию
            com:          this.#GetStrOrErr('com', com),
            arg:          this.#GetArrOrErr('arg', arg),
            value:        value,                        //TODO: указать тип value
            source:       this.#GetStrOrErr('source', source),
            destinations: this.#GetArrOrErr('destinations', destinations),
            type:         this.#GetType(type)
        }
    }
    /** утилитарные методы для работы с вх.данными */
    #GetStrOrErr = (key, val) => {
        return (typeof val == 'string') ? val : new Error(`${key} must be a string`);
    }

    #GetArrOrErr = (key, arr) => {
        return Array.isArray(arr) ? arr : new Error(`${key} must be an array`);
    }

    #GetType = typeName => {
        if (MSG_TYPE_LIST.includes(typeName))
            return typeName;
        return MSG_TYPE_EVENT;
    }
    /********************* */
}

module.exports = { 
    ClassBusMsg_S, 
    constants: { 
        MSG_TYPE_DEFAULT: MSG_TYPE_EVENT, 
        MSG_TYPE_REQUEST, 
        MSG_TYPE_RESPONSE, 
        MSG_TYPE_LIST
    }
};