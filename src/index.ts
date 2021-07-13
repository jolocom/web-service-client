export class JolocomWebServiceClient {
  wsReconnectTimeout = 1500
  msgFinalizationTimeout = 1000

  rpcWS?: WebSocket
  rpcWsUrl?: string
  serviceHostport: string
  serviceHttpUrl: string
  serviceWsUrl: string
  msgN = 0
  messages: { [id: string]: any } = {}

  constructor(serviceHostport='localhost:9000', base='/', enableTls=false) {
    const tls = enableTls ? 's' : ''
    this.serviceHostport = serviceHostport
    this.serviceHttpUrl = `http${tls}://${serviceHostport}${base}`
    this.serviceWsUrl = `ws${tls}://${serviceHostport}${base}`
  }

  async sendRPC(rpcName: string, request?: any, pathPrefix='/rpc'): Promise<any> {
    const followUpMsg: {
      processed?: Promise<any>
      resolve?: (value: any) => void
    } = {}
    const processed = new Promise((resolve, reject) => {
      console.log(
        'sending RPC call',
        { rpcName, request },
        'over',
        this.rpcWS ? 'WebSocket' : 'http(s)'
      )
      const msgID = this.msgN++
      const msg = {
        id: msgID,
        rpc: rpcName,
        request
      }
      if (this.rpcWS) {
        this.rpcWS.send(JSON.stringify(msg))
        this.messages[msgID] = {
          ...msg,
          followUps: [],
        }

        followUpMsg.resolve = resolve

        this.messages[msgID].followUps.push(followUpMsg)
      } else {
        resolve(
          fetch(`${this.serviceHttpUrl}${pathPrefix}`, {
            method: 'POST',
            body: JSON.stringify(msg),
            headers: {
              'Content-Type': 'application/json;charset=utf-8'
            },
          }).then(resp => {
              if (resp.status !== 200) {
                return resp.json().then(({ message }) => {
                  throw new Error(message)
                })
              }
              return resp.json()
            }).then(resJson => resJson.response)
        )
      }
    })

    if (this.rpcWS) followUpMsg.processed = processed

    return processed
  }

  disconnectWs() {
    this.rpcWS && this.rpcWS.close()
    delete this.rpcWS
    delete this.rpcWsUrl
    console.log('WebSocket Disconnected')
  }

  async connectWs(pathPrefix='/rpc') {
    this.disconnectWs()
    /* NOTE: unused code for 'sessions'
    const session = await fetch(
      `${this.serviceHttpUrl}${pathPrefix}`,
      { method: 'POST' }
    )
    const sessJson = await session.json()
    return this._doConnectWs(sessJson.urls.rpcWS)
    */
    const rpcWsUrl =`${this.serviceWsUrl}${pathPrefix}`
    await this._doConnectWs(rpcWsUrl)
    this.rpcWsUrl = rpcWsUrl
  }

  private _finalizeMessage(msgId: string) {
    // @ts-ignore
    if (this.msgFinalizationTimeout === -1) return
    setTimeout(() => delete this.messages[msgId], this.msgFinalizationTimeout)
  }

  private async _doConnectWs(rpcWsUrl: string) {
    const ws = new WebSocket(rpcWsUrl)

    ws.onmessage = (evt) => {
      let msg: any
      try {
        msg = JSON.parse(evt.data)
        console.log('received websocket data', msg)
        let storedMsg: any
        // If this is the first ever response in a thread then `this.messages[msg.id]` is there
        if (this.messages[msg.id]) {
          
          const msgIndex = msg.id
          storedMsg = this.messages[msgIndex]

          if(msg.response && msg.response.id) {
            storedMsg.responseId = msg.response.id

          } 
        } else {
          // This is a follow-up message in a thread. Get the related original stored message
          storedMsg = Object.keys(this.messages)
            .map((o) => this.messages[o])
            .find((m: any) => m.responseId == msg.id)
        }

        // Resolve the previous follow-up
        storedMsg.followUps[storedMsg.followUps.length - 1].resolve({
          ...msg.response,
          originalMsg: storedMsg,
        })

        // Prepare to for the next follow-up
        const followUpMsg: {
          processed?: Promise<void>
          resolve?: () => void
        } = {}
        followUpMsg.processed = new Promise((resolve, reject) => {
          followUpMsg.resolve = resolve
        })
        storedMsg.followUps.push(followUpMsg)

        //TODO: if there is no 'response id' on the first response (msg.response?.id is not there). 
        //  Or, if message status success or failer (there is more messages to receive), 
        //  Then:
        //    Do not prepare to for the next follow-up message.
        //    Call: this._finalizeMessage(msgIndex)
      } catch (err) {
        console.log('received websocket data', evt.data)
        console.error('error while processing websocket data', err)
      }
    }

    ws.onerror = (evt) => {
      console.error('websocket error', evt)
      if (ws.readyState !== WebSocket.OPEN) this.disconnectWs()
    }

    ws.onclose = (evt) => {
      delete this.rpcWS
      setTimeout(async () => {
        if (this.rpcWsUrl !== rpcWsUrl) return
        try {
          await this._doConnectWs(rpcWsUrl)
        } catch (err) {
          console.error('failed to reconnect to websocket at ', rpcWsUrl)
        }
      }, this.wsReconnectTimeout)
    }

    return new Promise<void>((resolve, reject) => {
      ws.onerror = (evt) => {
        console.error('error establishing WS conn', evt)
        this.disconnectWs()
        reject()
      }
      ws.onopen = (evt) => {
        //if (this.rpcWS !== ws) return ws.close()
        console.log('websocket connection established with', rpcWsUrl)

        ws.onerror = (evt) => {
          console.error('websocket error', evt)
          if (ws.readyState !== WebSocket.OPEN) this.disconnectWs()
        }
        resolve()
      }
    }).then(() => {
      if (this.rpcWS) this.rpcWS.close()
      this.rpcWS = ws
    })
  }
}
