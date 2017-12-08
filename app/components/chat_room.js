import React, { Component } from 'react';
import { observable } from 'mobx';
import { observer, inject } from 'mobx-react';
import CONST from '../constants';

@inject("store")
@observer
export default class ChatRoom extends Component {
  @observable originConn = null;
  @observable destConn = null;

  constructor() {
    super();
    this.offerOptions = CONST.CONFIG.OFFER;
    this.mediaOffer = CONST.CONFIG.MEDIA_OFFER;
    this.originStream = null;
    this.originCandidates = [];
    this.destCandidates = [];
    this.onCreateOfferSuccess = this.onCreateOfferSuccess.bind(this);
    this.onClickCancel = this.onClickCancel.bind(this);
  }

  componentDidMount() {
    this.startStream()
      .then(() => this.setupOrigin())
      .then(() => this.setupRemote())
      .then(() => {
        this.originConn.createOffer(this.offerOptions)
          .then(this.onCreateOfferSuccess, (err) => {
            console.error('create offer error :: ', err);
          });
      });
  }

  componentDidUpdate() {
    const { connInfo } = this.props.store;
    console.log('update', this.props.store.connInfo)
    if (connInfo.calleeOffer) {
      this.call();
    }
  }

  startStream() {
    return window.navigator.mediaDevices.getUserMedia(this.mediaOffer)
      .then((stream) => {
        this.originStream = stream;
        this.origin.srcObject = stream;
      });
  }

  setupOrigin() {
    return new Promise((resolve) => {
      this.originConn = new window.RTCPeerConnection(CONST.CONFIG.SERVER);
      this.originConn.onicecandidate = (e) => {
        if (!e.candidate) {
          // this.props.store.sendInvite(this.originCandidates);

          console.log('offer candidates over')
          return;
        }
        if (!this.originCandidates) {
          this.originCandidates = [];
        }
        this.originCandidates.push(e.candidate);
        console.log('offer candidates len', this.originCandidates.length)
      };

      // this.originConn.oniceconnectionstatechange = function (e) {
      //   console.log('ice change');
      // };

      this.originConn.addStream(this.originStream);
      resolve();
    });
  }

  setupRemote() {
    return new Promise((resolve) => {
      this.destConn = new window.RTCPeerConnection(CONST.CONFIG.SERVER);

      this.destConn.onicecandidate = (e) => {
        if (!e.candidate) {
          this.props.store.calling(this.destCandidates);
          return;
        }
        if (!this.destCandidates) {
          this.destCandidates = [];
        }
        this.destCandidates.push(e.candidate);
      };

      // this.destConn.oniceconnectionstatechange = function (e) {
      //   // this.onIceStateChange(pc1, e);
      // };

      this.destConn.onaddstream = (e) => {
        this.destinaton.srcObject = e.stream;
      }
      resolve();
    });
  }

  call() {
    const { connInfo } = this.props.store;
    this.destConn.setRemoteDescription(connInfo.callerOffer)
      .then(() => {
        console.log('set destination remote session success');
        return Promise.all(connInfo.callerOfferCandidates.map((can) => {
          return this.destConn.addIceCandidate(new RTCIceCandidate(can))
            .then(() => {
              console.log('set ICE candidate success');
            }, (err) => {
              console.error('set ICE candidate failed ::', err);
            });
        }));
      }, (err) => {
        console.error('set destination remote session failed ::', err);
      }).then(() => {
        this.destConn.createAnswer().then((ansDesc) => {
          this.onCreateAnswerSuccess(ansDesc);
        }, (err) => {
          console.error('create answer error :: ', err);
        });
      });
  }

  onCreateOfferSuccess(offer) {
    this.originConn.setLocalDescription(offer)
      .then(() => {
        console.log('set origin local session success');
        return this.props.store.setOffer(offer);
      }, (err) => {
        console.error('set origin local session failed ::', err);
      });
  }

  onCreateAnswerSuccess(answer) {
    this.destConn.setLocalDescription(answer)
      .then(() => {
        return this.props.store.setAnswer(answer);
        console.log('set destination local session success');
      }, (err) => {
        console.error('set destination local session failed ::', err);
      });
  }

  endCall(e) {
    e.preventDefault();
    this.originConn.close();
    this.destConn.close();
    this.originConn = null;
    this.destConn = null;
    this.props.history.push('/');
  }

  onClickCancel(e) {
    e.preventDefault();
    this.props.history.push('/');
  }

  getConnectionStatus() {
    let connectionMsg = null;
    const { connectionState } = this.props.store;
    const { CONN_STATE, UI } = CONST;
    const { CONN_MSGS } = UI;

    if (connectionState === CONN_STATE.CONNECTED) {
      this.finishConnection();
      return;
    }

    switch (connectionState) {
      case CONN_STATE.INIT:
        connectionMsg = CONN_MSGS.PREPARING_INVITE;
        break;
      case CONN_STATE.SEND_INVITE:
        connectionMsg = CONN_MSGS.SEND_INVITE;
        break;
      case CONN_STATE.INVITE_ACCEPTED:
        connectionMsg = CONN_MSGS.INVITE_ACCEPTED;
        break;
      case CONN_STATE.CALLING:
        connectionMsg = CONN_MSGS.CALLING;
        break;
      default:
        connectionMsg = UI.DEFAULT_LOADING_DESC
    }
    return (
      <div className="chat-room-conn-status">
        <div className="chat-room-conn-status-b">
          <h3 className="status">{connectionMsg}</h3>
          <div className="cancel-btn">
            <button
              type="button"
              className="btn primary"
              onClick={this.onClickCancel}
            >Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  finishConnection() {
    const { connInfo } = this.props.store;
    this.originConn.setRemoteDescription(connInfo.callerAnswer)
    .then(() => {
        console.log('set origin remote session success');
        Promise.all(connInfo.callerAnswerCandidates.map((can) => {
          return this.originConn.addIceCandidate(new RTCIceCandidate(can))
            .then(() => {
              console.log('set ICE candidate success');
            }, (err) => {
              console.error('set ICE candidate failed ::', err);
            });
        })).then(() => {
          this.connectionState = CONST.CONN_STATE.CONNECTED;
        });
      }, (err) => {
        console.error('set origin remote session failed ::', err);
      });
  }

  render() {
    const { match } = this.props;

    const friendId = match.params.friendId;

    return (
      <div className="chat-room">
        <div className="chat-room-b">
          <div className="chat-room-remote">
            <video ref={(c) => { this.destinaton = c; }} autoPlay></video>
          </div>
          <div className="chat-room-origin">
            <video ref={(c) => { this.origin = c; }} autoPlay></video>
          </div>
        </div>
        {this.getConnectionStatus()}
        <div className="chat-room-opts">
          <button type="button" onClick={this.endCall.bind(this)}>END</button>
        </div>
      </div>
    );
  }
}
