const { hash } = require('crypto');
const ClassBaseService_S = require('./srvService');

const KEEP_ALIVE_HASH = 5000;

const COM_PWSC_SEND    = 'proxywsc-send';
const COM_PWSC_GET_MSG = 'proxywsc-get-msg';
const COM_WSC_SEND = 'wsc-send';

const EVENT_ON_LIST_LHPBUS = [COM_PWSC_SEND, COM_PWSC_GET_MSG];
const EVENT_EMIT_LIST_WSC = [COM_WSC_SEND];

const BUS_NAME_LIST = ['sysBus', 'logBus', 'lhpBus'];

/**
 * @class является придатком WS Client и реализует 
 * - передачу сообщений, полученных от WSC, системным службам  
 * - обработку запросов и сообщений со сторону служб 
 */
class ClassProxyWSClient extends ClassBaseService_S {
    #_SourcesState;
    #_RequestList = {};
    /**
     * @constructor
     * @param {[ClassBus_S]} busList - список шин, созданных в проекте
     */
    constructor({ _busList, _node }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ _name: 'proxywsc', _busNameList: BUS_NAME_LIST, _busList, _node });
        this.FillEventOnList('lhpBus', EVENT_ON_LIST_LHPBUS);
    }
    /**
     * @method
     * @public
     * @description Срабатывает при запросе системной службы фреймворка на отправку сообщения на WSC
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    async HandlerEvents_proxywsc_send(_topic, _msg) {
        const msg_to_plc = _msg.value[0];
        // если запрос требует ответ, то его хэш сохраняется
        if (_msg.metadata.demandRes)
            this.#SaveMsgHash(_msg);
        // TODO: LHPify
        const lhp_msg = msg_to_plc;
        // извлечение имени источника, на который требуется отправить сообщение
        const source_name = _msg.arg[0];

        this.EmitEvents_wsc_send({ value: [lhp_msg], arg: [source_name] });
    }
    /**
     * @method 
     * @description Вызывается при обработке события 'proxywsc_msg_get', который инициируется WSC
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    HandlerEvents_proxywsc_get_msg(_topic, _msg) {
        // извлечение "ядра" сообщения, составленного службой контроллера
        // LHP.Unpack
        const msg_from_plc = _msg.value[0];
        const source_name = _msg.arg[0];
        const hash = this.#GetMsgHash(msg_from_plc.com, source_name);
        const msg = { 
            dest: msg_from_plc.com.split('-')[0],
            hash,
            com: msg_from_plc.com,
            arg: _msg.arg,      // arg = [sourceName] | sourceName извлекается из arg
            value: [msg_from_plc]
        };      
        this.EmitMsg('lhpBus', msg_from_plc.com, msg);
    }

    /**
     * @method
     * @public
     * @description Отправляет сообщение на WSC
     */
    EmitEvents_wsc_send({ value=[], arg, dest }) {
        const msg = this.CreateMsg({
            com: COM_WSC_SEND,
            value,
            arg,
            dest
        });
        return this.EmitMsg('lhpBus', COM_WSC_SEND, msg);         
    }
    /**
     * @method
     * @private
     * @description Сохраняет хэш сообщения, требующего ответ
     * @param {ClassBusMsg_S} _msg 
     */
    #SaveMsgHash(_msg) {
        const { hash, resCom } = _msg.metadata; 
        const sourceName = _msg.arg[0];
        // создание ключа, по которому сохраняется запрос
        const key = `${sourceName}_${resCom}`;
        /* по ключу создается и вызывается асинхронная функция f1, которая возвращает f2
           если f2 будет вызвана пользователем, то она вернет хэш запроса, выключит таймер ожидания и очистит свою позицию в списке.
           Иначе выполнится таймаут вызванный в f1 и хэш уже нельзя будет получить.
        */
        this.#_RequestList[key] = (() => {
            // callback очищающий ячейку списка
            const clear_cb = (() => { delete this.#_RequestList[key]; }).bind(this);
            // таймаут взводится на стандартное время TODO: оптимизировать время таймаута
            const timeout = setTimeout(clear_cb, KEEP_ALIVE_HASH);
            // возврат функции, вызов которой вернет хэш
            return () => {
                clearTimeout(timeout);
                clear_cb();
                return hash;
            }
        })();
    }
    /**
     * @method
     * @private
     * @description возвращает хэш сообщения-запроса, ответ на который пришел
     * @param {ClassBusMsg_S} _msg - сообщение-ответ
     * @returns 
     */
    #GetMsgHash(_com, _sourceName) {
        if (typeof _com === 'string' && typeof _sourceName === 'string') {
            const key = `${_sourceName}_${_com}`;

            const getHashFunc = this.#_RequestList[key];
            return getHashFunc?.();
        }
    }
}

module.exports = ClassProxyWSClient;