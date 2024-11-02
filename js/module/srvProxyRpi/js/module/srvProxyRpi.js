const ClassBaseService_S = require('srvService');

// ТОПИКИ/КОМАНДЫ
const COM_DM_DEVLIST_SET = 'dm-deviceslist-set';
const COM_PRPIC_MSG_GET  = 'proxyrpiclient-msg-get';
const COM_PRPIC_DEVLIST_GET = 'proxyrpiclient-deviceslist-get';
const COM_ALL_DATA_RAW_GET  = 'all-data-raw-get';
// 
const BUS_NAME_LIST = ['sysBus', 'logBus', 'rpiBus'];

// СПИСКИ ТОПИКОВ
const EVENT_ON_LIST_SYSBUS = ['all-init-stage1-set', 'all-close'];
const EVENT_ON_LIST_RPIBUS = [COM_PRPIC_DEVLIST_GET, COM_PRPIC_MSG_GET];

const EVENT_EMIT_DM_LIST = ['dm-deviceslist-set'];

const COM_RPIC_START_POL = 'rpiclient-start-polling';
/********************************* */

/**
 * @class
 * Реализует функционал прокси к функциональным узлам, собирающим данные о хабе
 */
class ClassProxyRpiClient_S extends ClassBaseService_S {
    #_Rpi;
    #_ChList = ['virtual-rpi-0', 'virtual-rpi-1', 'virtual-rpi-2', 'virtual-rpi-3', 'virtual-rpi-4', 'virtual-rpi-5'];
    /**
     * @constructor
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _node }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ _name: 'proxyrpiclient', _busNameList: BUS_NAME_LIST, _busList, _node });

        this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS);
        this.FillEventOnList('rpiBus', EVENT_ON_LIST_RPIBUS);
    }

    HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        Object.keys(this.SourcesState)
            .filter(_source => _source.Protocol === 'rpi')  
            .forEach(_source => {
                _source.CheckProxy = true;
                _source.PrimaryBus = 'rpiBus';

                this.emitEvents_logger_log({ msg: `rpi source ${_source.Name} checked by proxy`, level: 'I', obj: _source });
            });
    }
    /**
     * @method
     * @public
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxyrpiclient_sub_sensorall(_topic, _msg) {
        this._SubChannels = _msg.arg.map(_obj => _obj.name) ?? undefined;
        this.EmitEvents_rpiclient_start_polling();
    }
    /**
     * @method
     * @public
     * @description Принимает запрос на получение списка каналов источника
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxyrpiclient_deviceslist_get(_topic, _msg) {
        const { hash } = _msg.metadata;
        this.EmitEvents_dm_deviceslist_set({ hash });
    }
    /**
     * @method
     * @description Принимает данные данные с каналов хаба, форматирует их и отправляет
     * @param {string} _topic 
     * @param {object} _msg 
     */
    async HandlerEvents_proxyrpiclient_msg_get(_topic, _msg) {
        // const [ source_name ] = _msg.arg;
        const [ data_msg ] = _msg.value;

        const data_is_valid = typeof data_msg?.arg[0] === 'string' && typeof data_msg.value[0] === 'number'; 
        if (data_is_valid) {
            const msg = {
                dest: 'all',
                com: COM_ALL_DATA_RAW_GET,
                arg: _msg.arg,
                value: [{ com: COM_ALL_DATA_RAW_GET, arg: data_msg.arg, value: data_msg.value }]
            }
            
            this.EmitMsg('rpiBus', msg.com, msg);
        }
    }
    /**
     * @method
     * @public
     * @description Возвращает список каналов
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     * @returns 
     */
    async EmitEvents_dm_deviceslist_set(_topic, _msg) {
        const { hash } = _msg.metadata;
        const msg_to_dm = {
            dest: 'dm',
            hash,
            com: COM_DM_DEVLIST_SET,
            arg: [this.HostName],
            value: [
                {
                    com: COM_DM_DEVLIST_SET,
                    value: [{ sensor: [...this.#_ChList] }]
                }
            ]
        };
        return this.EmitMsg('rpiBus', msg_to_dm.com, msg_to_dm);
    }
    /**
     * @method
     * @public
     * @description Отправляет команду на запуск опроса каналов rpiclient
     */
    EmitEvents_rpiclient_start_polling() {
        const msg = {
            dest: 'rpiclient',
            com: COM_RPIC_START_POL
        }
        this.EmitMsg('rpiBus', msg.com, msg);
    }
}

module.exports = ClassProxyRpiClient_S;