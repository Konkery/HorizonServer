const ClassBaseService_S = require('../../srvService/js/srvService');

const COM_DM_DEVLIST_SET     = 'dm-deviceslist-set';
const COM_PMQTTC_DEVLIST_GET = 'proxymqttclient-deviceslist-get';
const COM_SUB_SENSALL      = 'proxymqttclient-sub-sensorall';
const COM_PMQTTC_SEND      = 'proxymqttclient-send';
const COM_PMQTTC_MSG_GET   = 'proxymqttclient-msg-get';
const COM_MQTTC_SEND       = 'mqttclient-send';
const COM_ALL_DATA_RAW_GET = 'all-data-raw-get';

const EVENT_ON_LIST_SYSBUS = ['all-init-stage1-set'];

const BUS_NAME_LIST = ['sysBus', 'mqttBus', 'logBus'];
const EVENT_ON_LIST_MQTTBUS = [COM_PMQTTC_DEVLIST_GET, COM_SUB_SENSALL, COM_PMQTTC_SEND, COM_PMQTTC_MSG_GET];

const channels_dummy = require('../../srvProcess/js/app/Channels');
const get_devlist = (_sourceName) => {
    let list = { sensor: [], actuator: [] }
    channels_dummy
        .filter(_ch => _ch.ChStatus == 'active' && _ch.SourceName == _sourceName)
        .forEach(_ch => {
            let ch_note = `${_ch.DeviceIdHash}-${_ch.DeviceId}-${_ch.ChNum}`;
            list[_ch.ChType].push(ch_note);
        });
    return list;
};

/**
 * @typedef MappingListDevice
 * @description Запись об одном канале: его name и address 
 * @property {string} name
 * @property {string} address
 */
/**
 * @typedef MappingList
 * @description Маппинг-таблица для сопоставления топика (address) с именем канала сенсора/актуатора (name) 
 * @property {[MappingListDevice]} sensor 
 * @property {[MappingListDevice]} actuator
 */


class ClassProxyMQTTClient_S extends ClassBaseService_S {
    #_SensSubList = {};
    constructor({ _busList, _node }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ _name: 'proxymqttclient', _busNameList: BUS_NAME_LIST, _busList, _node });
        this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS);
        this.FillEventOnList('mqttBus', EVENT_ON_LIST_MQTTBUS);
    }

    HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        Object.values(this.SourcesState)
            .filter(_source => _source.Protocol === 'mqtt')
            .forEach(_source => {
                _source.CheckProxy = true;
            });
    }
    /**
     * @method
     * @public
     * @description Отправляет службе mqttclient топик и значение, которое требуется записать
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxymqttclient_send(_topic, _msg) {
        const [ source_name ] = _msg.arg;
        const { source } = _msg.metadata;
        const [ value ]  = _msg.value;
        const [ payload ] = value.value;
        const topic_name = this.#_SensSubList[source_name]?.find(_obj => _obj.name === source).address;

        const msg_is_valid = typeof topic_name === 'string' && payload != undefined;
        if (msg_is_valid) {
            this.EmitEvents_mqttclient_send({ arg: _msg.arg, value: [topic_name, payload ]});
        }
    }
    /**
     * @method
     * @public
     * @description Принимает запрос на получение списка каналов источника
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxymqttclient_deviceslist_get(_topic, _msg) {
        // const [ source_name ] = _msg.arg;
        const { hash } = _msg.metadata;
        this.EmitEvents_dm_deviceslist_set({ hash, arg: _msg.arg });
    }

    /**
     * @method
     * @public
     * @description Сохраняет информацию, необходимую для сопоставления топиков и имен служб-каналов.
     * Отправляет на mqttclient команду подписаться на полученные топики  
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxymqttclient_sub_sensorall(_topic, _msg) {
        const [source_name] = _msg.arg;
        /* ch_list = { sensor: [{ name, address }, ...], actuator: { ... } ] */
        const [{ sensor = [], actuator = [] }] = _msg.value;
        const aggr_ch_map_list = [...sensor, ...actuator];
        const topic_list = [];
        aggr_ch_map_list.forEach(_mappingObj => {
            this.#_SensSubList[source_name] ??= [];
            this.#_SensSubList[source_name].push(_mappingObj);
            topic_list.push(_mappingObj.address);
        });
        if (topic_list.length) {
            this.EmitEvents_logger_log({ msg: `Channels mapping with MQTT addresses: ${aggr_ch_map_list}`, level: 'I', obj: aggr_ch_map_list });
            // подписка на адреса каналов-сенсоров 
            this.EmitEvents_mqttclient_sub({ arg: _msg.arg, value: sensor.map(_s => _s.address) });
        } else {
            this.EmitEvents_logger_log({ msg: `No MQTT address or channel to complete mapping`, level: 'I', obj: aggr_ch_map_list });
        }
    }
    /**
     * @method
     * @public
     * @description Принимает имя топика и сообщение с брокера.
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxymqttclient_msg_get(_topic, _msg) {
        const [source_name] = _msg.arg;
        const [topic_name, payload] = _msg.value;
        // вытягивается именно список, так как несколько каналов могут иметь одинаковый address
        // но извлекать из ответа разные значения по ValueKey или же обрабатывать разными мат. формулами 
        const ch_name_list = this.#_SensSubList[source_name]
            ?.filter(_obj => _obj.address === topic_name)
            ?.map(_obj => _obj.name);

        if (!ch_name_list) {
            this.EmitEvents_logger_log({ level: 'W', msg: `Received a msg from ${source_name}, ${topic_name}, but no Channel subscribed is found`, obj: _msg });
        }
        
        ch_name_list?.forEach(ch_name => {
            const msg = {
                dest: ch_name,
                com: COM_ALL_DATA_RAW_GET,
                arg: [source_name],
                value: [{
                    com: COM_ALL_DATA_RAW_GET,
                    arg: [ch_name],
                    value: [payload]
                }]
            }
            this.EmitMsg('mqttBus', msg.com, msg);
        });
    }
    /**
     * @method
     * @public
     * @description Отправляет на службу-клиент команду выполнить подписку на топик
     * @param {} param0 
     * @returns 
     */
    EmitEvents_mqttclient_sub({ arg, value }) {
        const msg = {
            dest: 'mqttclient',
            com: 'mqttclient-sub',
            arg,
            value
        }
        return this.EmitMsg('mqttBus', msg.com, msg);
    }
    /**
     * @method
     * @public
     * @description Отправляет на dm список каналов
     * @param {*} param0 
     */
    EmitEvents_dm_deviceslist_set({ arg, hash }) {
        const msg = {
            dest: 'dm',
            hash,
            com: COM_DM_DEVLIST_SET,
            arg,
            value: [{
                dest: 'dm',
                com: COM_DM_DEVLIST_SET,
                value: [get_devlist(arg[0])]
            }]
        }
        this.EmitMsg('mqttBus', msg.com, msg);
    }
    /**
     * @method
     * @public
     * @description Отправляет на MQTT Client запрос на отправку сообщения на брокер
     * @param {*} param0 
     */
    EmitEvents_mqttclient_send({ arg, value }) {
        const msg = {
            dest: 'mqttclient',
            com: COM_MQTTC_SEND,
            arg,
            value
        }
        this.EmitMsg('mqttBus', msg.com, msg);
    }
}

module.exports = ClassProxyMQTTClient_S;