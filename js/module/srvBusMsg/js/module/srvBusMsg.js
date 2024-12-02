/** КОНСТАНТЫ */
const MSG_TYPE_REQUEST  = 'req';        // запрос
const MSG_TYPE_RESPONSE = 'res';        // ответ
const MSG_TYPE_LIST = [MSG_TYPE_REQUEST, MSG_TYPE_RESPONSE]; 
/************ */
const generateHash = require('generateHash.js');
// const generateHash = () => Math.trunc(new Date().getTime()*Math.random());

/**
 * @typedef TypeBusMsgConstructor
 * @property {string} com
 * @property {[any]} arg
 * @property {[any]} value
 * @property {string} source
 * @property {string} resCom - ответная команда на запрос 
 * @property {string} dest - имя источника, которому предназначается контент сообщения
 * @property {boolean} demandRes - флаг того, требует ли сообщение ответ, который будет ожидаться посредством async-await
 * @property {string|number} [hash] - хэш сообщения, генерируется автоматически либо передается в конструктор; во втором случае сообщению присваивается type = 'res'
 */
/**
 * @class
 * Класс, предназначенный для создания сообщений, передающихся по шине фреймворка. Обеспечивает автоматическое создание timestamp и хэш ключа для каждого сообщения.
 * Предоставляет пля value и arg для для передачи любых типов значений и логического разделения значений, передающихся в сообщении.
 */
class ClassBusMsg_S {
    /**
     * @constructor
     * @param {TypeBusMsgConstructor} _msg 
     */
    constructor({ com, arg=[], value=[], source, dest, demandRes=false, resCom, hash }) {
        this.timestamp = new Date().getTime(),
        this.metadata = {
            hash: hash ?? generateHash(),                // TODO: использовать библиотечную функцию
            type: hash ? MSG_TYPE_RESPONSE : MSG_TYPE_REQUEST,
            demandRes: Boolean(demandRes),
            resCom,
            source: this.#GetStrOrErr('source', source),
            dest
        },
        this.com = this.#GetStrOrErr('com', com),
        this.arg = this.#GetArrOrErr('arg', arg),
        this.value = this.#GetArrOrErr('value', value)    
    }
    /** утилитарные методы для работы с вх.данными */
    #GetStrOrErr(key, val) {
        if (typeof val == 'string') 
            return val;
        throw new Error(`${key} must be a string`);
    }

    #GetArrOrErr(key, arr) {
        if (Array.isArray(arr)) 
            return arr;
        throw new Error(`${key} must be an array`);
    }
    /********************* */
}

module.exports = { 
    ClassBusMsg_S, 
    constants: { 
        MSG_TYPE_REQUEST, 
        MSG_TYPE_RESPONSE, 
        MSG_TYPE_LIST
    }
};