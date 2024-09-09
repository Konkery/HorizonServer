/** КОНСТАНТЫ */
const MSG_TYPE_REQUEST  = 'req';        // запрос
const MSG_TYPE_RESPONSE = 'res';        // ответ
const MSG_TYPE_LIST = [MSG_TYPE_REQUEST, MSG_TYPE_RESPONSE]; 
/************ */
const generateHash = () => Math.trunc(new Date().getTime()*Math.random());

/**
 * @typedef TypeBusMsgConstructor
 * @property {string} com
 * @property {[any]} arg
 * @property {[any]} value
 * @property {string} service - имя службы, которая отправила сообщение; 
 * @property {string} source 
 * @property {string} dest - имя источника, которому предназначается контент сообщения
 * @property {boolean} demandRes - флаг того, требует ли сообщение ответ, который будет ожидаться посредством async-await
 * @property {string|number} [hash] - хэш сообщения, генерируется автоматически либо передается в конструктор; во втором случае сообщению присваивается type = 'res'
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
    constructor({ com, arg=[], value=[], source, dest, demandRes=false,  hash }) {
        this.timestamp = new Date().getTime(),
        this.metadata = {
            hash: hash ?? generateHash(),                // TODO: использовать библиотечную функцию
            type: hash ? MSG_TYPE_RESPONSE : MSG_TYPE_REQUEST,
            demandRes: Boolean(demandRes),
            source: this.#GetStrOrErr('source', source),
            dest
        },
        this.com = this.#GetStrOrErr('com', com),
        this.arg = this.#GetArrOrErr('arg', arg),
        this.value = this.#GetArrOrErr('value', value)    
    }
    /** утилитарные методы для работы с вх.данными */
    #GetStrOrErr(key, val) {
        return (typeof val == 'string') ? val : new Error(`${key} must be a string`);
    }

    #GetArrOrErr(key, arr) {
        return Array.isArray(arr) ? arr : new Error(`${key} must be an array`);
    }

    #GetType(typeName) {
        if (MSG_TYPE_LIST.includes(typeName))
            return typeName;
        return MSG_TYPE_EVENT;
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