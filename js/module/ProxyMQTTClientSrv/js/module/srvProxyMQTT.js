const ClassBaseService_S = require("./srvService");

const COM_DM_DEVLIST_GET = 'dm-devicelist-get';
const COM_PMQTTC_DEVLIST_GET = 'proxymqttc-devicelist-get';
const COM_MQTTC_SEND = 'mqttc-send';

const BUS_NAME_LIST = ['sysBus', 'mqttBus', 'logBus'];
const EVENT_ON_LIST_MQTTBUS = ['proxymqtt-send', 'proxymqtt-get-msg'];

class ClassProxyMQTTClient_S extends ClassBaseService_S {
    constructor({ _busList, _node }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ _name: 'proxymqttc', _busNameList: BUS_NAME_LIST, _busList, _node });
        this.FillEventOnList('mqttBus', EVENT_ON_LIST_MQTTBUS);
    }
    /**
     * @method
     * @param {*} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxymqttc_send(_topic, _msg) {
        const [ source_name ] = _msg.arg;
        const [ topicName, payload ] = _msg.value;
        const msg_is_valid = typeof topicName === 'string' && typeof payload === 'string';
        if (msg_is_valid) {
            this.EmitEvents_mqttc_send(_msg);            
        }
    }
    /**
     * @method
     * @public
     * @description Принимает запрос на получение списка каналов источника
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxymqttc_devicelist_get(_topic, _msg) {
        const [ source_name ] = _msg.arg;
        const { hash } = _msg.metadata;
        this.EmitEvents_dm_devicelist_get({ hash });
    }
    HandlerEvents_proxymqttc_actuator_set(_topic, _msg) {
        // const [ source_name ] = _msg.arg;
        const [ ch_id ] = _msg.value[0].arg;
        // получение имени топика из id канала
        const topic_name = ch_id.split('-').slice(0, -1);
        // извлечение значения, которое записывается по топику
        const payload = _msg.value[0].value[0];
        this.EmitEvents_mqttc_send({ arg: _msg.arg, value: [topic_name, payload ]});
    }
    HandlerEvents_proxymqttc_sub_sensorall(_topic, _msg) {
        const source_name = _msg.arg[0];
        const ch_id_list = _msg.value;
        
    }
    /**
     * @method
     * @public
     * @description Принимает имя топика и сообщение с брокера.
     * @param {string} _topic 
     * @param {*} _msg 
     */
    HandlerEvents_proxymqttc_get_msg(_topic, _msg) {
        const [ source_name ] = _msg.arg;
        const [ topicName, payload ] = _msg.value;

        const ch_id = `${source_name}-${topicName}-00`;
        const com_raw_data = `${ch_id}-get-data-raw`;
    
        const msg = {
            dest: ch_id,
            com: com_raw_data,
            arg: [source_name],
            value: [{
                com: com_raw_data,
                value: [parseFloat(payload)]
            }]
        }
        this.EmitMsg('mqttBus', msg.com, msg);
    }
    EmitEvents_mqttс_sub({ arg, value }) {
        const msg = {
            dest: 'mqttc',
            com: 'mqttc-sub',
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
    EmitEvents_dm_devicelist_get({ arg, hash }) {
        const msg = {
            dest: 'dm',
            hash,
            com: COM_DM_DEVLIST_GET,
            arg,
            value: [{
                dest: 'dm',
                com: COM_DM_DEVLIST_GET,
                value: [
                    { sensor: [] }
                ]
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
    EmitEvents_mqttc_send({ arg, value }) {
        const msg = {
            dest: 'mqttc',
            com: COM_MQTTC_SEND,
            arg,
            value
        }
        this.EmitMsg('mqttBus', msg.com, msg);
    }
}

module.exports = ClassProxyMQTTClient_S;