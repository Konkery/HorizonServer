/**
 * @class
 * Интерфейс Node-RED
 * Связывает сообщения, получаемые механизмами NR с обработкой внутри классов служб
 */
class ClassNRInterface_S extends EventEmitter {
    /**
     * @constructor
     * @param {string} _serviceName 
     * @param {object} _node 
     */
    constructor(_serviceName, _node) {
        this._Node = _node;
        this.Active = true;     // флаг который будет проверяться перед вызовом каждого обработчика события
    }
    /**
     * @method
     * Принимает сообщение и перенаправляет его на шину
     * @param {string} com 
     * @param {[any]} arg 
     */
    Receive(msg) {
        // a)
        const com = msg.topic;
        const arg = msg.payload;
        // б) 
        // const { com, arg } = msg;
        this.emit(com, arg);
    }
    /**
     * @method
     * Создает обработчик для сообщения 
     * @param {string} com 
     * @param {Function} func 
     */
	AddHandler(com, func) { 
        this.on(com, (...args) => {     
            if (this.Active)         
                return func(...args);
        });
	}
    /**
     * @method
     * Отправляет сообщение
     * @param {string} com 
     * @param {[any]} arg 
     */
	Send(com, arg) {
        const msg = { topic: com, payload: arg };
        // альтернативно topic может быть строка, указывающая на данную службу+интерфейс

		this._Node.send(msg);
	}
}

module.exports = ClassNRInterface_S;