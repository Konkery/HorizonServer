const ClassBaseService_S = require('srvService');

const KEEP_ALIVE_HASH = 3000;

const COM_PWSC_SEND    = 'proxywsclient-send';
const COM_PWSC_MSG_GET = 'proxywsclient-msg-get';
const COM_WSC_SEND     = 'wsclient-send';
const COM_PWSC_SUB = 'proxywsclient-sub-sensorall';

const COM_DM_DEVLIST_GET = 'dm-deviceslist-get';
const COM_DM_DEVLIST_SET = 'dm-deviceslist-set';
const COM_PWSC_DEVLIST_GET = 'proxywsclient-deviceslist-get';

const EVENT_ON_LIST_SYSBUS = ['all-init-stage1-set', 'all-close'];
const EVENT_ON_LIST_LHPBUS = [COM_PWSC_SEND, COM_PWSC_DEVLIST_GET, COM_PWSC_MSG_GET, COM_PWSC_SUB];
const EVENT_EMIT_LIST_WSC = [COM_WSC_SEND];


const LHP_BUS = 'lhpBus';
const BUS_NAME_LIST = ['sysBus', 'logBus', LHP_BUS];

/**
 * @class 
 * @description Реализует службу прокси к WS Client и реализует: 
 * - передачу сообщений, полученных от WSC, системным службам  
 * - обработку запросов и сообщений со сторону служб 
 */
class ClassProxyWSClient_S extends ClassBaseService_S {
    #_RequestList = {};
    /**
     * @constructor
     * @param {[ClassBus_S]} busList - список шин, созданных в проекте
     */
    constructor({ _busList, _node }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ _name: 'proxywsclient', _busNameList: BUS_NAME_LIST, _busList, _node });
        this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS);
        this.FillEventOnList(LHP_BUS, EVENT_ON_LIST_LHPBUS);
    }

    HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        Object.keys(this.SourcesState)
            .filter(_source => _source.Protocol === 'lhp')  
            .forEach(_source => {
                _source.CheckProxy = true;
                _source.PrimaryBus = 'lhpBus';
            });
    }
    /**
     * @method
     * @public
     * @description Срабатывает при запросе системной службы фреймворка на отправку сообщения на WSC
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    async HandlerEvents_proxywsclient_send(_topic, _msg) {
        this.EmitEvents_logger_log({ msg: `proxywsc HandlerEvents_proxywsclient_send`, lvl: 'I', obj: _msg });
        // если запрос требует ответ, то его хэш сохраняется
        if (_msg.metadata.demandRes)
            this.#SaveMsgHash(_msg);

        // TODO: LHPify
        const lhp_msg = JSON.stringify(this.#GetPLCMsg(_msg));
        // извлечение имени источника, на который требуется отправить сообщение
        const source_name = _msg.arg[0];

        this.EmitEvents_wsclient_send({ value: [lhp_msg], arg: [source_name] });
    }
    /**
     * @method 
     * @description Вызывается при обработке события 'proxywsc_msg_get', который инициируется WSC
     * @param {string} _topic - команда
     * @param {ClassBusMsg_S} _msg - сообщение
     */
    HandlerEvents_proxywsclient_msg_get(_topic, _msg) {
        // извлечение "ядра" сообщения, составленного службой контроллера
        // LHP.Unpack
        const msg_from_plc = JSON.parse(_msg.value[0] ?? '');
        const [ source_name ] = _msg.arg;
        const hash = this.#GetMsgHash(msg_from_plc.com, source_name);
        const msg = { 
            dest: msg_from_plc.com.split('-')[0],
            hash,
            com: msg_from_plc.com,
            arg: _msg.arg,      // arg = [sourceName] | sourceName извлекается из arg
            value: [msg_from_plc]
        };      
        this.EmitMsg(LHP_BUS, msg_from_plc.com, msg);
    }
    /**
     * 
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxywsclient_deviceslist_get(_topic, _msg) {
        this.EmitEvents_logger_log({ msg: `proxywsc HandlerEvents_proxywsclient_deviceslist_get`, lvl: 'I', obj: _msg });
        _msg.resCom = COM_DM_DEVLIST_SET;
        const msg = { 
            arg: _msg.arg,  
            value: [JSON.stringify({
                com: COM_DM_DEVLIST_GET,
                arg: [],
                value: []
            })]   
        }
        this.#SaveMsgHash(_msg);
        this.EmitEvents_wsclient_send(msg);
    }

    HandlerEvents_proxywsclient_sub_sensorall(_topic, _msg) {
        const msg = { 
            arg: _msg.arg,  
            value: [JSON.stringify({
                com: 'dm-sub-sensorall',
                arg: [],
                value: []
            })]   
        }
        this.#SaveMsgHash(_msg);
        this.EmitEvents_wsclient_send(msg);
    }

    /**
     * @method
     * @public
     * @description Отправляет сообщение на WSC
     */
    EmitEvents_wsclient_send({ value=[], arg, dest }) {
        const msg = this.CreateMsg({
            dest: 'wsclient',
            com: COM_WSC_SEND,
            value,
            arg
        });
        this.EmitEvents_logger_log({ msg: `proxywsc send msg to wsclient`, lvl: 'I', obj: msg });
        return this.EmitMsg(LHP_BUS, COM_WSC_SEND, msg);         
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
     * @param {string} _com - команда
     * @param {string} _sourceName - имя plc источника
     * @returns 
     */
    #GetMsgHash(_com, _sourceName) {
        if (typeof _com === 'string' && typeof _sourceName === 'string') {
            const key = `${_sourceName}_${_com}`;

            const getHashFunc = this.#_RequestList[key];
            return getHashFunc?.();
        }
    }
    /**
     * @method
     * @param {*} _msg 
     * @returns {Boolean}
     */
    #IsActuatorWrite(_msg) {
        const { source: service_name } = _msg.metadata;
        return this.ServicesState[service_name]?.Service?.ChType === 'actuator';
    }

    #GetPLCMsg(_msg) {
        /*
         * сообщение от службы-актуатора
         *_msg.value = { arg: [ch_name], value }
         */
        return this.#IsActuatorWrite(_msg) 
            ? ({ com: 'dm-actuator-set', arg: _msg.value[0].arg, value: _msg.value[0].value }) 
            : _msg.value[0];
    }
}

module.exports = ClassProxyWSClient_S;