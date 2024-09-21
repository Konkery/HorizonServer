const ClassBaseService_S = require('srvService');
const mqtt = require('mqtt');

const COM_MQTTC_SEND = 'mqttc-send';
const COM_PMQTTC_GET_MSG = 'proxymqttc-get-msg';
const COM_ALL_CONNS_DONE = 'all-connections-done';

class ClassMQTTClient_S extends ClassBaseService_S {
    #_Clients = [];
    #_SourcesState;
    constructor({ _busList, _node }) {
        super({ _name: 'mqttclient', _busNameList: ['sysBus', 'mqttBus', 'logBus'], _busList, _node });
        this.FillEventOnList('mqttBus', ['mqttc-send', 'mqttc-sub']);
    }

    async HandlerEvents_all_init1(_topic, _msg) {
        super.HandlerEvents_all_init1(_topic, _msg);
        this.#_SourcesState = _msg.value[0].SourcesState;

        this.#EstablishConnections();
    }
    /**
     * @method
     * @public
     * @description Устанавливает обходит подключения с доступными источниками.
     * Созданные клиенты сохраняются в поле #_Clients. 
     */
    async #EstablishConnections() {
        // отбор источников, к которым будет попытка подключения
        const mqtt_sources = this.#_SourcesState._Collection
            .filter(_source => !_source.IsConnected && _source.Type === 'mqtt');
        // получение списка промисов-оберток над подключением к каждому источнику
        const connect_result = await Promise.all(mqtt_sources.map(_source => {
            return this.#CreateConnection(_source);
        }));
        // перебор удачных/неудачных подключений
        connect_result.forEach((_conn, _i) => {
            // объект источника из SourcesState, соответствующий объекту подключения
            const source = mqtt_sources[_i];
            if (this.#_Clients[source.Name]) {
                // TODO: обработать ситуацию когда имя клиента уже занято
            } else
                this.#_Clients[source.Name] = _conn;
            // обновление флага источника
            this.#_Clients[source.Name].IsConnected = true;
            // установка обработчиков на события
            this.#SetConnectionHandlers(this.#_Clients[source.Name], source);
        });
    }
    /**
     * @method
     * @public
     * @description Выполняет подписку на указанный топик брокера.
     * @param {string} _topic 
     * @param {*} _msg 
     */
    async HandlerEvents_mqttc_sub(_topic, _msg) {
        // { arg: 'brokerName',  value: [topicName1, topicName2, ...] }
        const source_name = _msg.arg[0];
        const topic_list = _msg.value;
        await this.#_Clients[source_name]?.subscribe(topic_list);
    }
    /**
     * @method
     * @public
     * @description Принимает сообщение и отправляет его на брокер
     * @param {string} _topic 
     * @param {ClassBusMsg} _msg 
     */
    HandlerEvents_mqttc_send(_topic, _msg) {
        // { arg: 'brokerName',  value: [topicName, payload] }
        const source_name = _msg.arg[0];
        const [topicName, payload] = _msg.value;
        const client = this.#_Clients.find(_client => _client.Name === source_name);
        client.publishAsync(topicName, payload);
    }
    /**
     * @method
     * @public
     * @description Создает объект подключения
     * @param {} _source 
     * @returns 
     */
    #CreateConnection(_source) {
        return new Promise(async (res, rej) => {
            let name = (_source.DNS) ? _source.DNS : _source.IP;
            let url = `${name}:${_source.Port}`;
            try {
                const connection = await mqtt.connectAsync(url);
                // TODO: специфицировать настройки подключения
                res(connection);
            } catch (e) {
                res(null);
            }
        });
    }
    /**
     * @method
     * @private
     * @description Устанавливает обработчики на события подключения
     * @param {mqtt.MqttClient} _connection 
     * @param {*} _source 
     */
    #SetConnectionHandlers(_connection, _source) {
        _connection.on('message', (_topic, _payload) => {
            this.EmitEvents_proxymqttc_get_msg({ 
                arg: [_source.Name], value: [_topic, _payload]
            });
        }); 
        _connection.on('connect', () => {
            _source.IsConnected = true;
        })
        _connection.on('close', () => {
            _source.IsConnected = false;
        });
    }
    /**
     * @method
     * @public
     * @description Отправляет на mqttBus сообщение с данными от брокера
     */
    EmitEvents_proxymqttc_get_msg({ arg, value }) {
        const msg = {
            dest: 'proxymqttc',
            com: COM_PMQTTC_GET_MSG,
            arg,
            value
        }
        this.EmitMsg('mqttBus', msg.com, msg);
    }
    /**
     * @method
     * @public
     * @description Отправляет на sysBus сообщение о готовности подключений
     */
    EmitEvents_all_connections_done() {
        this.EmitMsg('sysBus', COM_ALL_CONNS_DONE, {
            com: COM_ALL_CONNS_DONE,
            dest: 'dm'
        });
    }
}

module.exports = ClassMQTTClient_S;