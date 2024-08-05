class WebSocketClient {
    constructor() {
        //something
        this._Socket;
    }
    Init(_array) {
        for (let i = 0; i < _array.length; i++) {
            let url = 'ws://' + _array[i].cName + ':' + _array[i].port;
            console.log ('Trying to connect to ' + url);
            let socket = new WebSocket(url);

            socket.onopen = function() {
                alert("Соединение установлено.");
              };
              
              socket.onclose = function(event) {
                if (event.wasClean) {
                  alert('Соединение закрыто чисто');
                } else {
                  alert('Обрыв соединения');
                }
                alert('Код: ' + event.code + ' причина: ' + event.reason);
              };
              
              socket.onmessage = function(event) {
                alert("Получены данные " + event.data);
              };
              
              socket.onerror = function(error) {
                alert("Ошибка " + error.message);
              };
        }

        //this._Socket = new WebSocket ()
        
    }
}
module.exports = WebSocketClient;