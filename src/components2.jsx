import React, {useRef, useState as nativeUseState, useEffect, useCallback, useMemo} from "react";
import ReactDOM from "react-dom";
import {Button, Tooltip, Overlay, OverlayTrigger} from 'react-bootstrap';
import {Database} from "./firebase-loader";

import {findGreenlight} from "./findGreenlight";

let converterDiv;
let userCache = {};

let _audioContext;
let _audioProcessor;
let audioFeedback;
let lastRenderErrorTime = null;
let audioHistory = [];

let _videoPreview;
let _audioPreview;

let _audioDeviceList = [];
let _videoDeviceList = [];

let _micState = "off";
let _videoState = "off";

let _mediaTested = null;

let _audioSelection = {
    prev: {deviceId: undefined, label: undefined},
    current: {deviceId: undefined, label: undefined}
};

let _videoSelection = {
    prev: {deviceId: undefined, label: undefined},
    current: {deviceId: undefined, label: undefined}
};

// only used once to avoid calling getUserMedia twice when _mediaTested is null;
let _videoStreamInfo = {deviceId: null, stream: null};
let _audioStreamInfo = {deviceId: null, stream: null};

const stopAudioFeedback = () => {
    // on iPad, at least, it seems that if you stop the audio you won't get it back
    // but I doubt it this is the right thing to do.
    const isIPad = navigator.userAgent.match(/\biPad\b/);
    const stopTracks = !isIPad;

    if (_audioStreamInfo.stream) {
        console.log("stop _audioStreamInfo");
        _audioStreamInfo.stream.getTracks().forEach(track => track.stop());
        _audioStreamInfo.stream  = null;
    }

    let audio = audioFeedback;
    if (!audio) {return;}

    console.log("stop audioFeedback", !!audioFeedback, `stopTracks=${stopTracks}`);

    if (audio.input) {
        audio.input.disconnect();
    }
    if (audio.processor) {
        audio.processor.disconnect();
        audio.processor.port.onmessage = null;
    }
    /*
    if (audio.context) {
        audio.context.close();
    }
    */
    if (audio.clone) {
        audio.clone.getTracks().forEach(track => track.stop());
    }

    if (audio.stream && stopTracks) {
        audio.stream.getTracks().forEach(track => track.stop());
    }

    audioFeedback = null;

    let audioPreview = _audioPreview;
    if (!audioPreview) {return;}
    let ctx = audioPreview.getContext('2d');
    let width = audioPreview.width;
    let totalHeight = audioPreview.height;
    ctx.clearRect(0, 0, width, totalHeight);
    _audioPreview = null;

};

function stopAudioContext() {
    if (_audioContext) {
        _audioContext.close();
        _audioContext = null;
    }
}

const stopVideoPreview = () => {
    if (_videoStreamInfo.stream) {
        _videoStreamInfo.stream.getTracks().forEach(track => track.stop());
        _videoStreamInfo.stream  = null;
    }

    let videoPreview = _videoPreview;
    if (!videoPreview) {return;}
    console.log(`stopVideoPreview (preview ${videoPreview ? "" : "not "}found)`);
    if (videoPreview.srcObject) {
        videoPreview.srcObject.getTracks().forEach(t => t.stop());
    }
    videoPreview.srcObject = null;
    videoPreview.onloadedmetadata = null;
    videoPreview.pause();

};

const defaultUser = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAwCAYAAACFUvPfAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAv5JREFUeNrsWT1MU1EUvn0Wg9ABF4GJYnQ0lk0TNa+Jg3HBnYHH4mawmyYmLQPBrTZuLpYZE9oFHUioaILjC67GdEQXMVaNgOA59b6kLe/+nPvea9/wvuSk/Fzu/e53z7nn3ANjCRIkGDhSUUz67e4tu+Pb/fMb226sSAPBLHzcA5sFy4GNCYY2wZB8HawBG2n2nTSQdeBjkRM1QQ2sAuQbkZPmR/8SLBvSaSPpAsWFUgSyeOxFsIcRxdcSEC+FRpoT3grgChSXWQDy+4FI95GwB3STvIy4FTPCjK+1LhtgKSZY7zNhDzYIVia7B/wRBlzZZMUzFy+x1Gim/fXx1z12/GXPlHze70pMSxJGkbpC+kqOjRQeM2t8ouvnRx9d9vvFc/b38yfqlHi1Tuu6R1GS2XwxdP0GyzytnCLsbQZ/hydARBYELClJc5UdUoYCV0CFVWNGnyybuMi8jtIOdVZU2fNhadTDKeBYA7UdFel56qzW+CQhSC+bqD0rJM1dg1xTWBcmIr8CZUrbJjPitaaLk9YPkyXGQNCciLRR5Xa4805/7If3pmpnRaSnTGbD+/dwR03mT/1VkEQTrtKIX+WVdhIR4WDzTTvBhIF0WJFy8rPFWo8W2dnbd9jQtZssleFpHJQ92Hwt3dDASHe6Sq8L4IbCRNqnliXfIJ66ssSBxI92XfDrtcCq95L+Tq3mMDX71Rt+aRw3hYakMQaIQemKArFBISwqkHSqwcxKRSv197QgfElrn9u5+w+oi56qQ4bnFnSHdzV8ukjzd5mrsyCqFRQYC4QHr7RgWu1XrUE4qbqKdBWPg8UHTfAAudLcRSoxIr2k+9x6FhO1XRCxSnmNO/xhOUjM+PX4hH0PvsPqIN1C1JRUNWsKlLs7RFRlzcg49vKQsDTrqJT2bpM8JcVHSVhL6R7VSyadJ500zf63eGtaSYk6O39glk0fwYJkVlD1pAOR7iBv8x6JY6hsjd8QTXL6DyoTD1T879ZVHqy2gKTL7a2uGyRIYIB/AgwAEdL8NfOBdYgAAAAASUVORK5CYII=";

function cleanup() {
    if (Database) {
        Database.forgetAllSubscriptions();
    }
    let findRootOf = (n) => {
        // there is a weird browser extension that wants to wrap a random react element
        while (n) {
            let p = n.parentNode;
            if (!p || p === document.body) {
                return n;
            }
            n = p;
        }
        return null;
    };

    ["#user-page"].forEach((n) => {
        let elem = document.querySelector(n);
        let root = findRootOf(elem);
        if (elem) {
            ReactDOM.unmountComponentAtNode(elem);
            elem.remove();
            if (root) {
                root.remove();
            }
        }
    });

    ["#user-css", "#feedback-css", "#font-awesome", "#fa-v4-font-face", "#fa-v4-shim", "#fa-main", "#fa-v4-shims"].forEach((n) => {
        let elem = document.querySelector(n);
        if (elem) {
            elem.remove();
        }
    });

    document.querySelectorAll("link").forEach((n) => {
        if (n.href.indexOf("fontawesome.com") >= 0) {
            n.remove();
        }
    });

    stopAudioContext();

    let root = document.querySelector("#croquet-root");
    if (root) {
        root.style.setProperty("display", "inherit");
    }

    let loader = document.querySelector("#loader");
    if (loader) {
        loader.remove();
    }
}

export function useState(initialValue, optName) {
    let [state, setState] = nativeUseState(initialValue);

    let s = (value) => {
        setState(value);
        if (optName) {
            // console.log(`value for ${optName}: `, value);
        }
    };
    return [state, s];
}

export function jsonUnescape(str) {
    if (!converterDiv) {
        converterDiv = document.createElement("div");
    }

    converterDiv.innerHTML = str;
    return converterDiv.innerText;
}

export function cachedGetUser(uid, viewId, guestName) {
    let cached = userCache[uid];
    if (cached) {
        return Promise.resolve(cached);
    }

    cached = userCache[viewId];
    if (cached) {
        return Promise.resolve(cached);
    }

    if (!uid) {
        cached = {
            uid,
            name: guestName || "Guest",
            email: "none",
            photoURL: defaultUser
        };
        userCache[viewId] = cached;
        return Promise.resolve(cached);
    }

    return Database.getUser(uid).then((u) => {
        if (u) {
            cached = {
                uid,
                name: u.name,
                email: u.email,
                photoURL: u.photoURL || defaultUser,
            };
            userCache[uid] = cached;
            return cached;
        }
        return null;
    });
}

function RoomRow(props) {
    let {info: {name, lastVisited, ownerId, boardId, activeViewIds}, selectBoard} = props;
    let nOccupants = Object.keys(activeViewIds).length;
    let active = nOccupants > 0;

    let [names, setNames] = useState([], "names");

    let [ownerName, setOwnerName] = useState("", "ownerName");

    let onClick = useCallback((_evt) => {
        selectBoard(boardId);
    }, [boardId, selectBoard]);

    const dateString = useCallback((date) => {
        try {
            return date.toLocaleDateString([], {dateStyle: "short"});
        } catch (err) {
            return date.toLocaleDateString();
        }
    }, []);

    useEffect(() => {
        cachedGetUser(ownerId).then(info => {
            if (info && info.name) {
                setOwnerName(info.name);
            }
        });
    }, [ownerId]);

    useEffect(() => {
        let result = [];
        for (let k in activeViewIds) {
            let u = activeViewIds[k];
            result.push(u);
        }

        const sorter = (a, b) => {
            let time = (c) => c.time ? c.time.toMillis() : 0;
            return time(a) - time(b);
        };

        result.sort(sorter);

        result = result.map(u => u["guestName"]);
        setNames(result);
    }, [activeViewIds]);

    return (
        <div onClick={onClick} className="room-row">
            <div className="room-row-active-holder">
                <div className="room-row-active" active={`${active}`}></div>
                <FilterIcon type={"active"}/>
            </div>
            <div className="room-row-element room-row-name">
                <div className="room-row-element-content">
                    {name}
                </div>
            </div>
            <div className="room-row-element room-row-last-visited">
                <div className="room-row-element-content">
                    {dateString(lastVisited)}
                </div>
            </div>
            <div className="room-row-element room-row-owner">
                <div className="room-row-element-content">
                    {ownerName}
                </div>
            </div>
            <div className="room-row-element room-row-occupants">
                <Occupants names={names} number={nOccupants} boardId={boardId}/>
            </div>
            <div className="room-row-element room-row-link">
                <CopyLink boardId={boardId}/>
            </div>
        </div>
    );
}

export function Rooms(props) {
    let {selectBoard} = props;

    let rooms = props.rooms.map((r, i) => <RoomRow key={i} info={r} selectBoard={selectBoard}/>);

    return (
        <div className="user-page-rooms-list">
            {rooms}
        </div>
    );
}

export function BoardPage(props) {
    // let [activeTab, setActiveTab] = useState("RoomEnter"); // "RoomSettings, "ChatSettings", "RoomDescription", "RoomAdvancedSettings"
    let [title, setTitle] = useState("");
    let [warningShowing, setWarningShowing] = useState(false, "warningShowing");
    //let [warningPosition, setWarningPosition] = useState(false, "warningPosition");

    let {currentBoard, currentBoardInfo, updateCurrentBoard, boardSettingsPageShown, setBoardSettingsPageShown, handleDelete, handleDuplicate, activeTab, setActiveTab, deferred} = props;

    // let isPrivate = false; // currentBoardInfo.access === "private";
    let boardWritable = props.boardWritable; // && isPrivate;
    let writable = boardWritable; // || teamWritable;

    const videoPreviewRef = useRef(null);
    const audioPreviewRef = useRef(null);
    let isMounted = useRef(true);

    const tabs = useMemo(() => {
        let result = [];

        result.push({
            label: "Enter",
            value: "RoomEnter",
            icon: "enter",
            title: "$n",
            Pane: BoardEnterPane
        });

        result.push({
            label: "Settings",
            value: "RoomSettings",
            icon: "settings",
            title: "$n",
            Pane: BoardBasicSettingsPane
        });

        if (writable) {
            /*
              result.push({
                label: "Description",
                value: "RoomDescription",
                icon: "description",
                title: "$n",
                Pane: BoardDescriptionPane
            });
            */
        }

        if (writable) {
            result.push({
                label: "Advanced",
                value: "RoomAdvancedSettings",
                icon: "advanced",
                title: "$n",
                Pane: BoardAdvancedSettingsPane
            });
        }
        return result;
    }, [writable]);

    useEffect(() => {
        return () => {
            console.log("unmounted");
            stopAudioFeedback();
            stopVideoPreview();
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        let obj = tabs.find(o => o.value === activeTab);
        if (obj) {
            let name = currentBoardInfo && currentBoardInfo.name || "";
            setTitle(obj.title.replace("$n", name));
        }
    }, [activeTab, tabs, currentBoardInfo]);

    let handleWarningCancel = () => {
        setWarningShowing(false);
    };

    let handleDeleteWarning = () => {
        setWarningShowing(true);
    };

    const handleCloseBoardPage = useCallback(() => {
        updateCurrentBoard(null);
        setBoardSettingsPageShown(false);
        setActiveTab("RoomEnter");
    }, [updateCurrentBoard, setBoardSettingsPageShown, setActiveTab]);

    let panes = tabs.map((info) => {
        let display = info.value === activeTab;

        return (
            <info.Pane
                handleDelete={handleDelete}
                handleDuplicate={handleDuplicate}
                key={info.value}
                value={info.value}
                writable={writable}
                user={props.user}
                currentBoard={currentBoard}
                currentBoardInfo={currentBoardInfo}
                updateCurrentBoard={updateCurrentBoard}
                activeTab={activeTab}
                deferred={deferred}
                display={display}
                boardSettingsPageShown={boardSettingsPageShown}
                handleCloseBoardPage={handleCloseBoardPage}
                handleDeleteWarning={handleDeleteWarning}
                videoPreviewRef={videoPreviewRef}
                audioPreviewRef={audioPreviewRef}
                isMounted={isMounted}/>);
    });

    let warningPosition = {left: "150px", top: "-450px", width: "500px"};
    let warningOpacity = warningShowing ? "0.2" : "1";

    return (
        <div className="board-page-background" id="board-page-background">
            <div className="board-settings">
                <div className="board-settings-main" style={{opacity: warningOpacity}}>
                    <BoardSettingsTabs
                        tabs={tabs}
                        setActiveTab={setActiveTab}
                        activeTab={activeTab} />
                    <div className="board-settings-basic-pane">
                        <div className="board-settings-title no-select">{title}</div>
                        {panes}
                    </div>
                    <div className="board-settings-close-button-holder">
                        <CloseSettingsPageButton handleCloseSettings={handleCloseBoardPage} />
                    </div>
                </div>
                <div className="warning-dialog-holder shadow" style={warningPosition}>
                    <Warning
                        name={currentBoardInfo && currentBoardInfo.name}
                        handleDelete={handleDelete}
                        handleWarningCancel={handleWarningCancel}
                        showing={activeTab === "RoomAdvancedSettings" && warningShowing}
                        position={warningPosition}/>
                </div>
            </div>
        </div>
    );
}

function BoardEnterPane(props) {
    let {currentBoardInfo, currentBoard, currentTeamInfo, boardSettingsPageShown, isMounted, videoPreviewRef, audioPreviewRef, deferred, activeTab} = props;

    /* deferred: selectBoard isNew sets it
       if deferred
       reallyChangeState <-

 */

    let boardName = currentBoardInfo ? currentBoardInfo.name : "";
    let boardId = currentBoardInfo ? currentBoardInfo.id : null;
    let teamName = currentTeamInfo ? currentTeamInfo.name : "";
    let teamId = currentTeamInfo ? currentTeamInfo.id : null;
    let publicBoard = currentBoardInfo && currentBoardInfo.access === "public";
    let chat = (currentBoardInfo && currentBoardInfo.chat) || "default";
    let videoChat = chat === "default" || chat === "videoOnly";

    let user = useMemo(() => props.user || {}, [props.user]);

    let guestNameRef = useRef(null);

    let [micState, setMicState] = useState("off", "micState");
    let [videoState, setVideoState] = useState("off", "videoState");

    //let [openButtonPressed, setOpenButtonPressed] = useState(false, "openButtonPressed"); // user has pressed the button to open a room

    const [audioSelection, setAudioSelection] = useState({
        prev: {deviceId: undefined, label: undefined},
        current: {deviceId: undefined, label: undefined}
    }, "audioSelection");
    const [videoSelection, setVideoSelection] = useState({
        prev: {deviceId: undefined, label: undefined},
        current: {deviceId: undefined, label: undefined}
    }, "videoSelection");

    // null: not tested, true: succeeded, false; failed
    const [audioDeviceList, setAudioDeviceList] = useState([], "audioDeviceList");
    const [videoDeviceList, setVideoDeviceList] = useState([], "videoDeviceList");

    const [showVideoErrorMessage, setShowVideoErrorMessage] = useState(false);
    const [showAudioErrorMessage, setShowAudioErrorMessage] = useState(false);

    // null: not required. "": required but not filled. <string>: required and filled
    const [guestName, setGuestName] = useState(null);

    // const [audioFeedback, setAudioFeedback] = useState(null, "audioFeedback");

    const [reallyChangeState, setReallyChangeState] = useState(null, "reallyChangeState");

    const [enterOverlayShowing, setEnterOverlayShowing] = useState(false, "enterOverlayShowing");

    useEffect(() => {
        setReallyChangeState((oldInfo) => {
            if (oldInfo === null) {
                if (!deferred || (deferred && activeTab === "RoomEnter")) {
                    if (boardSettingsPageShown && currentBoard !== null) {
                        return true;
                    }
                }
            }
            if (!boardSettingsPageShown) {
                return false;
            }
            return oldInfo;
        });
    }, [currentBoard, boardSettingsPageShown, deferred, activeTab]);

    useEffect(() => {
        if (!navigator.mediaDevices.ondevicechange) {
            navigator.mediaDevices.ondevicechange = reenumerateDevices;
        }
        return () => {navigator.mediaDevices.ondevicechange = null;};
    }, [reenumerateDevices]);

    useEffect(() => {
        let closer = () => {
            stopVideoPreview();
            stopAudioFeedback();
        };
        if (reallyChangeState !== null) {
            setReallyChangeState(null);
            if (reallyChangeState) {
                if (!videoChat) {
                    setMicState("off");
                    setVideoState("off");
                    closer();
                    return closer;
                }
                setMicState("on");
                setVideoState("on");
                testInitMedia().then(({videoOk, audioOk}) => {
                    if (!isMounted.current) {
                        return false;
                    }
                    _micState = !videoChat || !audioOk ? "unavailable" : "on";
                    setMicState(_micState);
                    _videoState = !videoChat || !videoOk ? "unavailable" : "on";
                    setVideoState(_videoState);
                    return initMedia({video: videoOk, audio: audioOk});
                }).then((flag) => {
                    if (!isMounted.current) {
                        return;
                    }
                    // initMedia will have returned null if the open button has been pressed
                    if (flag) {
                        reenumerateDevices();
                    }
                });
            }
            return closer;
        }
        return null;
        // return  Promise.resolve(false);
    }, [reallyChangeState, enumerateDevices, testInitMedia, initMedia, reenumerateDevices, videoChat, isMounted]);

    const storeSettings = () => {
        if (window.localStorage) {
            try {
                window.localStorage.setItem("userSelectedMediaDevices", JSON.stringify({audio: _audioSelection.current.label, video: _videoSelection.current.label}));
            } catch (e) {
                console.log("error in writing to localStorage");
            }
        }
    };

    const loadSettings = () => {
        if (window.localStorage) {
            try {
                return JSON.parse(window.localStorage.getItem("userSelectedMediaDevices"));
            } catch (e) {
                console.log("error in writing to localStorage");
            }
        }
        return null;
    };

    const handleOpenBoard = useCallback(() => {
        //setOpenButtonPressed(true);

        let nickname;
        if (!user || !user.uid) {
            if (!publicBoard) {
                return;
            }
        }
        if (user && !user.uid && guestName) {
            user.name = guestName;
        }
        nickname = user.name;

        let sessionName = boardId;
        let initials = initialsFrom(nickname);
        let walletname = "public";
        // let userColor = randomColor();

        let mic = _micState;
        let video = _videoState;

        if (!videoChat) {
            mic = "unavailable";
            video = "unavailable";
        }

        let cameraDeviceLabel = _videoSelection.current.label || _videoSelection.prev.label;
        let micDeviceLabel = _audioSelection.current.label || _audioSelection.prev.label;

        storeSettings();

        let cookedChat = chat === "default" ? undefined : (chat === "noChat" ? "off" : chat);

        findGreenlight().then((loadGreenlight) => {
            let options = {
                nickname, walletname, initials, sessionName, boardName, teamId, teamName,
                mic, video, micDeviceLabel, cameraDeviceLabel, chat: cookedChat
            };
            loadGreenlight(() => {
                window.document.title = `G: ${boardName || ""}`;
                window.fromLandingPage = options;
                cleanup();
            }, options, null);
        });
    }, [boardId, boardName, guestName, publicBoard, teamId, teamName, user, chat, videoChat]);

    const handleMicButton = useCallback(() => {
        if (_micState === "unavailable") {return;}
        let newState = _micState === "on" ? "off" : "on";
        _micState = newState;
        setMicState(newState);
        let doActivate = newState === "on";
        // turn on by re-activating prev state; turn off by nulling
        // out current (after copying current to prev)
        let [changed, newValue] = updateInputState("audio", doActivate ? _audioSelection.prev : null, doActivate);
        if (changed) {
            _audioSelection = newValue;
            setAudioSelection(newValue);
            initMedia({audio: true});
        }
    }, [updateInputState, initMedia]);

    const handleVideoButton = useCallback(() => {
        if (_videoState === "unavailable") {return;}
        let newState = _videoState === "on" ? "off" : "on";
        _videoState = newState;
        setVideoState(newState);
        let doActivate = newState === "on";
        let [changed, newValue] = updateInputState("video", doActivate ? _videoSelection.prev : null, doActivate);
        if (changed) {
            _videoSelection = newValue;
            setVideoSelection(newValue);
            initMedia({video: true});
        }
    }, [updateInputState, initMedia]);

    // handle a new user selection in the audio device list
    const handleAudioChanged = useCallback((evt) => {
        let deviceId = evt.target.value;
        // look up selected device by deviceId
        let info = lookupDeviceInfo(deviceId, _audioDeviceList);
        let [changed, newValue] = updateInputState("audio", info, _micState === "on");
        if (changed)  {
            _audioSelection = newValue;
            setAudioSelection(newValue);
            if (newValue.current.deviceId) {
                initMedia({audio: true});
            }
        }
    }, [lookupDeviceInfo, updateInputState, initMedia]);

    const handleVideoChanged = useCallback((evt) => {
        let deviceId = evt.target.value;
        let info = lookupDeviceInfo(deviceId, _videoDeviceList);
        let [changed, newValue] = updateInputState("video", info, _videoState === "on");
        if (changed) {
            _videoSelection = newValue;
            setVideoSelection(newValue);
            if (newValue.current.deviceId) {
                initMedia({video: true});
            }
        }
    }, [lookupDeviceInfo, updateInputState, initMedia]);

    const createAudioProcessor = useCallback((context) => {
        if (_audioProcessor) {
            return Promise.resolve(_audioProcessor);
        }
        let path = window._production || "./user";
        return context.audioWorklet.addModule(`${path}/src/audio-visualizer.js`).then(() => {
            _audioProcessor = new AudioWorkletNode(context, "processor");
            return _audioProcessor;
        });
    }, []);

    const setupAudioFeedback = useCallback((stream) => {
        if (stream.getAudioTracks().length === 0) {
            console.log("video only stream, perhaps for screen share");
            return;
        }

        if (!_audioContext) {
            _audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        let input = _audioContext.createMediaStreamSource(stream);

        createAudioProcessor(_audioContext).then((processor) => {
            processor.port.onmessage = (event) => {
                let volume = event.data.volume || 0;
                renderAudioFeedback(volume);
            };
            input.connect(processor);
            processor.connect(_audioContext.destination);
            audioFeedback = {stream, input, processor, time: 0};
        }).catch((e) => {
            console.log("cannot createAudioProcessor", e);
        });
    }, [renderAudioFeedback, createAudioProcessor]);

    const testInitMedia = useCallback(() => {
        // console.log("testInitMedia: ", _mediaTested);
        // this test is only run once.

        if (!navigator.mediaDevices.getUserMedia) {
            let v = {videoOk: false, audioOk: false};
            _mediaTested = v;
            return Promise.resolve(v);
        }

        if (_mediaTested !== null) {
            return Promise.resolve(_mediaTested);
        }

        const video = navigator.mediaDevices.getUserMedia({
            video: {
                frameRate: 12,
                aspectRatio: 1.33,
                width: 240,
                height: 240 / 1.33,
                resizeMode: "crop-and-scale",
            },
            audio: false
        }).then((stream) => {
            console.log("video test succeeded");
            _videoStreamInfo = {deviceId: "default", stream: stream};
            // stream.getTracks().forEach(t => t.stop());
            if (!isMounted.current) {
                return false;
            }
            return true;
        }).catch((err) => {
            console.log("video test failed: " + err.name);
            if (!isMounted.current) {
                return false;
            }
            let [_vchanged, vValue] = updateInputState("video", null, false);
            _videoSelection = vValue;
            setVideoSelection(vValue);
            _videoState = "unavailable";
            setVideoState(_videoState);
            setShowVideoErrorMessage(true);
            return false;
        });

        const audio = navigator.mediaDevices.getUserMedia({
            audio: true
        }).then((stream) => {
            console.log("audio test succeeded");
            _audioStreamInfo = {deviceId: "default", stream: stream};
            //stream.getTracks().forEach(t => t.stop());
            if (!isMounted.current) {
                return false;
            }
            return true;
        }).catch((err) => {
            console.log("audio test failed: " + err.name);
            // shift any existing device from current to prev,
            // and clear current
            if (!isMounted.current) {
                return false;
            }
            let [_achanged, aValue] = updateInputState("audio", null, false);
            _audioSelection = aValue;
            setAudioSelection(aValue);
            _micState = "unavailable";
            setMicState(_micState);
            setShowAudioErrorMessage(true);
            return false;
        });

        return Promise.all([video, audio]).then(([videoOk, audioOk]) => {
            _mediaTested = {videoOk, audioOk};
            return {videoOk, audioOk};
        });
    }, [updateInputState, isMounted]);

    const initVideoMedia = useCallback(() => {
        /*
        if (_videoPreview) {
            stopVideoPreview();
            }*/

        let then = (stream) => {
            console.log("video init succeeded");
            if (!isMounted.current) {
                throw new Error("unmounted");
            }
            stopVideoPreview();
            /*
            if (openButtonPressed) {
                stream.getTracks().forEach(t => t.stop());
                return false;
            }
            */
            _videoPreview.srcObject = stream;
            _videoPreview.onloadedmetadata = () => {
                _videoPreview.play();
                _videoState = "on";
                setVideoState(_videoState);
            };
            return true;
        };
        let error = (err) => {
            console.log("video init failed: " + err.name);
            if (!isMounted.current) {stopVideoPreview(); return false;}
            let [changed, newValue] = updateInputState("video", null, false);
            if (changed) {
                _videoSelection = newValue;
                setVideoSelection(newValue);
            }
            _videoState = "unavailable";
            setVideoState(_videoState);
            return false;
        };

        _videoPreview = videoPreviewRef.current;
        if (_videoSelection.current.deviceId) {
            if (_videoStreamInfo.stream) {
                console.log("using cached video stream");
                let s = _videoStreamInfo.stream;
                _videoStreamInfo.stream = null;
                return Promise.resolve(then(s));
            }
            return navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: _videoSelection.current.deviceId,
                    frameRate: 12,
                    aspectRatio: 1.33,
                    width: 240,
                    height: 240 / 1.33,
                    resizeMode: "crop-and-scale",
                },
                audio: false
            }).then(then).catch(error);
        }
        stopVideoPreview();
        _videoState = "off";
        setVideoState("off");
        return Promise.resolve(false);
    }, [updateInputState, videoPreviewRef, isMounted]);

    const initAudioMedia = useCallback(() => {
        let then = (stream) => {
            console.log("audio init succeeded");
            if (!isMounted.current) {
                throw new Error("unmounted");
            }
            setupAudioFeedback(stream);
            _micState = "on";
            setMicState(_micState);
            return true;
        };
        let error = (err) => {
            console.log("audio init failed: " + err.name);
            if (!isMounted.current) {stopAudioFeedback(); return false;}
            // shift any existing device from current to prev,
            // and clear current
            let [changed, newValue] = updateInputState("audio", null, false);
            if (changed) {
                _audioSelection = newValue;
                setAudioSelection(newValue);
            }
            _micState = "unavailable";
            setMicState(_micState);
            return false;
        };
        if (_audioSelection.current.deviceId) {
            if (_audioStreamInfo.stream) {
                console.log("using cached audio stream");
                let s = _audioStreamInfo.stream;
                _audioStreamInfo.stream = null;
                return Promise.resolve(then(s));
            }
            return navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: _audioSelection.current.deviceId,
                }
            }).then(then).catch(error);
        }
        stopAudioFeedback();
        _micState = "off";
        setMicState("off");
        return Promise.resolve(false);
    }, [updateInputState, setupAudioFeedback, isMounted]);

    const initMedia = useCallback((types) => {
        if (!isMounted.current) {
            return Promise.resolve(false);
        }

        if (!videoChat) return Promise.resolve(false);

        return enumerateDevices().then(() => {
            const promises = [];
            if (types.video) promises.push(initVideoMedia());
            if (types.audio) promises.push(initAudioMedia());
            return Promise.all(promises).then(() => true);
        });
    }, [enumerateDevices, initAudioMedia, initVideoMedia, videoChat, isMounted]);

    const lookupDeviceInfo = useCallback((deviceId, list, optLabel) => {
        if (!optLabel) {
            return list.find((info) => info.deviceId === deviceId);
        }
        return list.find((info) => info.label === optLabel);
    }, []);

    const renderAudioFeedback = useCallback((v) => {
        let audioPreview = audioPreviewRef.current;
        if (!audioPreview) {
            let errorNow = Date.now();
            if (!lastRenderErrorTime || (errorNow - lastRenderErrorTime > 30000)) {
                console.log("audioPreview is null, but still render is called");
                lastRenderErrorTime = errorNow;
            }
            return;
        }
        audioHistory.push(v);
        if (audioHistory.length > 8) {
            audioHistory.shift();
        }

        let ctx = audioPreview.getContext('2d');
        let width = audioPreview.width;
        let totalHeight = audioPreview.height;
        ctx.clearRect(0, 0, width, totalHeight);
        let step = 6;
        let middleStart = width / 2 - step;
        ctx.fillStyle = "#8c6ce8";
        audioHistory.forEach((vol, i) => {
            let ind = 7 - i;
            let height = Math.min(vol * 20, 30);
            let top = (totalHeight - height) / 2;
            ctx.fillRect(middleStart + (ind * step), top, step, height);
            if (i !== 0) {
                ctx.fillRect(middleStart - (ind * step), top, step, height);
            }
        });
    }, [audioPreviewRef]);

    // update an input descriptor of the form
    // {
    //      prev: { deviceId: undefined, label: undefined },
    //      current: { deviceId: undefined, label: undefined }
    // }

    // if there is no deviceId in current, and doActivate is false,
    // then just install info (if any) into prev.

    // otherwise copy current to prev, and
    //   if info has a deviceId, install that as the new current
    //   else leave current as undefined if that's what it was,
    //     otherwise set it to null.
    // and return true as the changed flag
    const updateInputState = useCallback((type, info, doActivate) => {
        let obj;
        if (type === "video") {
            obj = {..._videoSelection};
        } else if (type === "audio") {
            obj = {..._audioSelection};
        }

        let changed = false;
        let infoDeviceId = info && info.deviceId;
        let veryFirstTime = obj.current.deviceId === undefined;
        if (!obj.current.deviceId && !doActivate) {
            if (infoDeviceId) {
                if (obj.prev.deviceId !== info.deviceId ||
                    obj.prev.label !== info.label) {
                    obj.prev = {deviceId: info.deviceId, label: info.label};
                    changed = true;
                }
            }
        } else {
            obj.prev = {deviceId: obj.current.deviceId, label: obj.current.label};
            if (infoDeviceId) {
                obj.current = {deviceId: info.deviceId, label: info.label};
            } else {
                // undefined is used to denote that we still have not determined
                // even the default device. It happens here when one of camera or mic
                // is blocked so fails in testInitMedia().
                let val = veryFirstTime ? undefined : null;
                obj.current = {deviceId: val, label: val};
            }
            changed = true;
        }
        return [changed, obj];
    }, []);

    const enumerateDevices = useCallback(() => {
        return new Promise((resolve) => {
            navigator.mediaDevices.enumerateDevices().then((ary) => {
                let audio = [];
                let video = [];
                let fillInAudio = null;
                let fillInVideo = null;
                let local = loadSettings();
                ary.forEach((device) => {
                    let {deviceId, kind, label} = device;
                    // "communications" appears to be another somewhat-
                    // reserved device id.
                    if (deviceId === "default" || deviceId === "communications") {
                        // console.warn(`rejecting "default" device (${label})`);
                        return;
                    }
                    let list;
                    let info;
                    if (kind === "videoinput") {
                        list = video;
                        info = _videoSelection;
                    } else if (kind === "audioinput") {
                        list = audio;
                        info = _audioSelection;
                    }
                    if (!info) {return;}
                    if (info.current.deviceId === undefined) {
                        // really for the very first time
                        if (local) {
                            if (kind === "videoinput") {
                                fillInVideo = local.video;
                            } else if (kind === "audioinput") {
                                fillInAudio = local.audio;
                            }
                        }
                        info.current = {deviceId, label};
                    }
                    let selected = false;
                    if (info.current.deviceId) {
                        selected = info.current.deviceId === deviceId;
                    } else if (info.prev.deviceId) {
                        selected = info.prev.deviceId === deviceId;
                    }
                    list.push({deviceId, selected, label});
                });
                if (fillInAudio) {
                    let fill = lookupDeviceInfo(null, audio, fillInAudio);
                    if (fill) {
                        let newAudioSelection = {..._audioSelection};
                        newAudioSelection.current = {...fill};
                        _audioSelection = newAudioSelection;
                        setAudioSelection(_audioSelection);
                    }
                }
                if (fillInVideo) {
                    let fill = lookupDeviceInfo(null, video, fillInVideo);
                    if (fill) {
                        let newVideoSelection = {..._videoSelection};
                        newVideoSelection.current = {...fill};
                        _videoSelection = newVideoSelection;
                        setVideoSelection(_videoSelection);
                    }
                }
                resolve({video, audio});
            });
        });
    }, [lookupDeviceInfo]);

    const reenumerateDevices = useCallback(() => {
        if (boardSettingsPageShown) {
            enumerateDevices().then((info) => {
                _audioDeviceList = info.audio;
                setAudioDeviceList(info.audio);
                _videoDeviceList = info.video;
                setVideoDeviceList(info.video);
            });
        }
    }, [boardSettingsPageShown, enumerateDevices]);

    useEffect(() => {
        let required = currentBoardInfo && currentBoardInfo.access === "public" && !user.uid;
        if (guestName === null && required) {
            setGuestName("");
        }
    }, [user, currentBoardInfo, guestName]);

    useEffect(() => {
        if (guestNameRef.current) {
            if (guestName === "") {
                guestNameRef.current.textContent = "";
            }
        }
    }, [guestNameRef, guestName]);

    let guestNameChange = useCallback((str) => {
        setGuestName(str);
    }, []);

    let maybeNameField = guestName !== null
        ? <GuestUserName guestName={guestName} onChange={guestNameChange} nameRef={guestNameRef} enterOverlayShowing={enterOverlayShowing}/>
        : null;

    let topStyle = {display: props.display ? "flex" : "none"};

    let errorMargin = showVideoErrorMessage || showAudioErrorMessage || (guestName !== null)
        ? {marginTop: "8px"}
        : {marginTop: "50px"};

    return (
        <div className="board-settings-page" style={topStyle}>
            <div className="width-fit">
                <SettingsMenu1 handler={handleAudioChanged} deviceList={audioDeviceList} type={"audio"} display={videoChat} selected={audioSelection.current.deviceId || audioSelection.prev.deviceId}/>
            </div>
            <div className="width-fit">
                <SettingsMenu1 handler={handleVideoChanged} deviceList={videoDeviceList} type={"video"} display={videoChat} selected={videoSelection.current.deviceId || videoSelection.prev.deviceId}/>
            </div>
            <div className="board-settings-video-preview-holder">
                <div className="board-settings-media-button-holder"></div>
                <VideoPreview nocamera={videoState !== "on"} videoPreviewRef={videoPreviewRef} />
                <div className="board-settings-media-button-holder">
                    <MediaButton position="top" state={micState} handleClick={videoChat ? handleMicButton : null} type="microphone" />
                    <MediaButton position="bottom" state={videoState} handleClick={videoChat ? handleVideoButton : null} type="video" />
                </div>
            </div>
            <div className="board-settings-audio-preview-holder row justify-content-center">
                <AudioPreview audioPreviewRef={audioPreviewRef} />
            </div>
            <div className="guest-name width-fit">
                {maybeNameField}
            </div>
            <MediaErrorMessage videoError={showVideoErrorMessage} audioError={showAudioErrorMessage} />
            <div style={errorMargin}>
                <OpenBoardButton handleOpenBoard={handleOpenBoard} id={boardId} disabled={guestName === ""} setEnterOverlayShowing={setEnterOverlayShowing}/>
            </div>
        </div>
    );
}

export function BoardSettingsTabs(props) {
    const handleClick = (value) => {
        props.setActiveTab(value);
    };
    let tabs = props.tabs;

    let tabLabels = tabs.map((info) => (
        <BoardSettingsTabLabel
            setActiveTab={props.setActiveTab}
            activeTab={props.activeTab}
            handleClick={handleClick}
            key={info.label}
            label={info.label}
            icon={info.icon}
            value={info.value}/>
    ));

    return (
        <div className="board-settings-tabs">
            {tabLabels}
        </div>
    );
}

function BoardBasicSettingsPane(props) {
    let {currentBoardInfo, writable, updateCurrentBoard} = props;
    let currentChat = currentBoardInfo && currentBoardInfo.chat;
    let [video, setVideo] = useState(currentChat === undefined || currentChat === "default" || currentChat === "videoOnly");
    let [text, setText] = useState(currentChat === undefined || currentChat === "default" || currentChat === "textOnly");

    let selectChatFeatureHandler = (feature, value) => {
        if (feature === "video") {
            setVideo(value);
        }
        if (feature === "text") {
            setText(value);
        }
    };

    useEffect(() => {
        let value;
        if (video && text) {
            value = "default";
        } else if (video && !text) {
            value = "videoOnly";
        } else if (!video && text) {
            value = "textOnly";
        } else if (!video && !text) {
            value = "noChat";
        }
        if (value !== currentChat) {
            updateCurrentBoard({chat: value});
        }
    }, [currentChat, text, video, updateCurrentBoard]);

    const chatFeatureLabel = "Choose which chat features to be included inside the room.";

    let handleNameAccept = (name) => {
        updateCurrentBoard({name});
    };

    let creatorRef = useRef(null);
    let nameRef = useRef(null);

    useEffect(() => {
        if (!currentBoardInfo) {
            return;
        }

        let ownerId = currentBoardInfo.ownerId;

        cachedGetUser(ownerId).then((n) => {
            if (creatorRef.current && n) {
                // this check is legit. It may get unmounted during the promise resolution
                creatorRef.current.textContent = n.name;
            }
        });
    }, [currentBoardInfo]);

    let topStyle = {display: props.display ? "flex" : "none"};

    return (
        <div className="board-settings-page" style={topStyle}>
            <div className="board-settings-pane-top">
                <TextSetting
                    onAccept={handleNameAccept}
                    writable={writable}
                    addButtonColumn={true}
                    baseClassName="board-basic-settings-field"
                    originalContent={currentBoardInfo.name}
                    displayLabel="Name"
                    nameRef={nameRef} />
                <TextSetting
                    writable={false}
                    addButtonColumn={true}
                    baseClassName="board-basic-settings-field"
                    displayLabel="Creator"
                    nameRef={creatorRef} />
                <div className="board-page-settings-label chat-feature-container no-select">
                    <div className="chat-feature-label">
                        {chatFeatureLabel}
                    </div>
                    <ChatCheckBox
                        selectChatFeatureHandler={selectChatFeatureHandler}
                        writable={writable}
                        feature="text"
                        current={text}/>
                    <ChatCheckBox
                        selectChatFeatureHandler={selectChatFeatureHandler}
                        writable={writable}
                        feature="video"
                        current={video}/>
                </div>
            </div>
        </div>
    );
}

/*
function BoardDescriptionPane(props) {
    // let {currentBoardInfo, writable, updateCurrentBoard} = props;

    let topStyle = {display: props.display ? "flex" : "none"};

    return (
        <div className="board-settings-page" style={topStyle}>
            <div className="board-settings-basic-pane pl-4">
            </div>
        </div>
    );
}
*/

function BoardAdvancedSettingsPane(props) {
    let {writable, display, handleDeleteWarning} = props;
    let topStyle = {display: display ? "flex" : "none"};

    /*
<div className="board-advanced-duplicate-button-container">
  <button className="btn btn-success">
  <ActionButton
    writable={writable}
    label="Duplicate Room"
    value="DuplicateRoom"
    onClick={props.handleDuplicate}/>
  </button>
  <div className="fine-print">Duplicate the room as a template.</div>
</div>
*/

    return (
        <div className="board-settings-page board-settings-advanced-pane" style={topStyle}>
            <div className="board-advanced-buttons-container">
                <div className="board-advanced-delete-button-container shadow">
                    <button className="btn btn-danger">
                        <ActionButton
                            writable={writable}
                            label="Delete Room"
                            value="DeleteRoom"
                            onClick={handleDeleteWarning}
                            finePrint=""/>
                    </button>
                    <div className="fine-print text-danger">This cannot be undone.</div>
                </div>
            </div>
        </div>
    );
}

export function UserName(props) {
    return (
        <div className="user-name-label">
            <span>{props.userName}</span>
        </div>
    );
}

export function UserPhoto(props) {
    const [failed, setFailed] = useState(false);
    const handleImageErrored = () => setFailed(true);

    if (failed || !props.url) {
        return (
            <div className="user-photo user-photo-initials no-select">
                <span>{props.initials}</span>
            </div>
        );
    }
    return (
        <img
            className="user-photo no-select"
            src={props.url}
            onError={handleImageErrored}></img>
    );
}

function OpenBoardButton(props) {
    let {disabled, handleOpenBoard, setEnterOverlayShowing} = props;
    let timer = useRef(null);

    let onClick = () => {
        if (disabled) {
            setEnterOverlayShowing(true);
            if (timer.current) {
                clearTimeout(timer.current);
            }
            timer.current = setTimeout(() => {
                setEnterOverlayShowing(false);
            }, 2000);
            return;
        }
        setEnterOverlayShowing(false);
        handleOpenBoard(/*props.id*/);
    };
    let disabledStyle = disabled ? "disabled button-style-disabled" : "";

    return (
        <button className={`btn btn-success ${disabledStyle}`} onClick={onClick}>
            <div className="board-page-open-label">Enter</div>
        </button>
    );
}

function SettingsMenu1(props) {
    let displayLabel;
    let {handler, deviceList, type, selected, display} = props;
    if (type === "audio") {
        displayLabel = "Audio Source";
    } else {
        displayLabel = "Video Source";
    }

    let list = deviceList.map((device) => {
        let {deviceId, label} = device;
        return <option className="board-page-settings-option" key={deviceId} value={deviceId}>{label}</option>;
    });

    let videoDisplay = display ? {} : {visibility: "hidden"};

    return (
        <div className="board-settings-media-list-container" style={videoDisplay}>
            <div className="board-page-settings-label">{displayLabel}</div>
            <select className="btn btn-light dropdown-toggle board-page-settings-select" onChange={handler} value={selected || "(none)"}>{list}</select>
        </div>
    );
}

function MediaErrorMessage(props) {
    const { audioError, videoError } = props;
    const display = audioError || videoError ? "inherit" : "none";
    const errors = [];
    if (videoError) errors.push("video");
    if (audioError) errors.push("audio");
    const errorString = `${errors.join(", ")} source not available.`;
    return (
        <div style={{display}}>{errorString}</div>
    );
}

function CloseSettingsPageButton(props) {
    return (
        <Button
            variant="danger" className="closeButton"
            onClick={props.handleCloseSettings}>x</Button>
    );
}

function VideoPreview(props) {
    let background = props.nocamera ? "board-page-video-preview-background" : "board-page-video-preview-waiting";
    return (<video className={`board-page-video-preview ${background}`} ref={props.videoPreviewRef}/>);
}

function AudioPreview(props) {
    return (
        <canvas
            className="audio-preview"
            width={100}
            height={30}
            ref={props.audioPreviewRef} />
    );
}

function MediaButton(props) {
    // props.type is either "video" or "microphone"
    let cls = props.state === "on" ? `fa-${props.type}` : `fa-${props.type}-slash`;
    let color = props.state === "on" ? "#28a745" : "#ef4a3e";
    return (
        <div
            className="board-page-media-button"
            style={{color, border: `1px solid ${color}`}}
            onClick={props.handleClick}>
            <i className={`fas ${cls}`}></i>
        </div>
    );
}

function BoardSettingsTabLabel(props) {
    let {label, activeTab, icon} = props;

    let handleClick = () => {
        props.handleClick(props.value);
    };

    return (
        <div
            activetab={(activeTab === props.value).toString()}
            className="board-settings-tab-button"
            onClick={handleClick}>
            <svg className="board-settings-tab-icon"
                viewBox="0 0 24 24">
                <use href={`#img-${icon}`}></use>
            </svg>
            <div className="board-settings-tab-label no-select">{label}</div>
        </div>
    );
}

function ActionButton(props) {
    let onClick = props.writable ? props.onClick : null;
    let extraClass = props.writable ? "" : "disabled";

    return (
        <div ref={props.holderRef} className="board-advanced-button-holder no-select">
            <div
                writable={(!!props.writable).toString()}
                className={`${extraClass}`}
                onClick={onClick}>{props.label}</div>
            <div
                writable={(!!props.writable).toString()}
                className="board-action-button-fine-print">{props.finePrint}</div>
        </div>
    );
}

function TextSetting(props) {
    let [buttonDisabled, setButtonDisabled] = useState(true); // though there doesn't have to be a button

    const [wasComposing, setWasComposing] = useState(false, "wasComposing");

    const onPaste = useCallback((evt) => {
        evt.preventDefault();
        let text = evt.clipboardData.getData("text/plain");

        if (nameRef.current) {
            nameRef.current.textContent += text;
        }
    }, [nameRef]);

    let {
        writable, // can user edit?
        nameRef,
        displayLabel,
        baseClassName,
        onChange, // every change to the (trimmed) content
        onAccept, // when enter (or accept button) is pressed
        addButtonColumn, // adds "accept" button if writable, else leaves space
        originalContent
    } = props;

    useEffect(() => {
        nameRef.current.innerHTML = originalContent;
    }, [nameRef, originalContent]);

    const onKeyDown = (evt) => {
        if (evt.key === "Enter") {
            setWasComposing(evt.nativeEvent && evt.nativeEvent.isComposing);
            evt.preventDefault();
            evt.stopPropagation();
        } else {
            setWasComposing(false);
        }
    };

    const onKeyUp = (evt) => {
        if (evt.key === "Escape" && typeof originalContent === "string") {
            // this will reset the cursor to the start,
            // as usual.  fix it one day.
            nameRef.current.textContent = originalContent;
        }

        const trimmed = nameRef.current.textContent.trim();
        if (evt.key !== "Enter" && onChange) {
            onChange(trimmed);
        } else if (evt.key === "Enter") {
            if (!wasComposing) {
                evt.preventDefault();
                evt.stopPropagation();
                acceptContent();
            }
            return;
        }

        let hasChanges = trimmed !== originalContent;
        setButtonDisabled(!hasChanges);
    };

    const acceptContent = () => {
        if (nameRef.current && onAccept) {
            let trimmed = nameRef.current.textContent.trim();
            if (trimmed !== originalContent) onAccept(trimmed);
        }
        setButtonDisabled(true);
    };

    let holderClassName = "board-page-settings-holder";
    let labelClassName = "board-page-settings-label no-select";
    let textClassName = "board-page-settings-text";

    if (baseClassName) {
        holderClassName += ` ${baseClassName}-holder`;
        labelClassName += ` ${baseClassName}-label`;
        textClassName += ` ${baseClassName}-text`;
    }

    if (!writable) textClassName += " no-select";
    if (addButtonColumn) textClassName += " col-9";

    let buttonClass = "";
    if (buttonDisabled) {
        buttonClass = "disabled";
    }

    let maybeButton = (addButtonColumn && writable) ? <Button variant="success" className={buttonClass} onClick={acceptContent} style={{marginLeft: "10px"}}>Apply</Button> : <div />;
    return (
        <div className={holderClassName}>
            <div className={`${labelClassName} no-select`}>{displayLabel}</div>
            <div className="board-page-settings-inner">
                <div
                    ref={nameRef}
                    className={textClassName}
                    contentEditable={writable}
                    onKeyDown={onKeyDown}
                    onKeyUp={onKeyUp}
                    onPaste={onPaste} />
                {maybeButton}
            </div>
        </div>
    );
}

function ChatCheckBox(props) {
    let {current, writable, selectChatFeatureHandler, feature} = props;

    let onChange = useCallback((e) => {
        selectChatFeatureHandler(feature, e.target.checked);
    }, [feature, selectChatFeatureHandler]);

    let label = feature === "video" ? "Video" : "Text Chat";

    return (
        <div className="chat-checkbox-holder">
            <input className="chat-checkbox-box" type="checkbox" defaultChecked={current} onChange={onChange} disabled={!writable}/>
            <span className="chat-checkbox-label">{label}</span>
        </div>
    );
}

function CopyLink(props) {
    let [copying, setCopying] = useState(false);
    let [hovered, setHovered] = useState(false);
    let timer = useRef(null);
    let {boardId} = props;

    let targetRef = useRef(null);

    let copyLinkHandler = useCallback(() => {
        let location = window.location;
        let origin = `${location.protocol}//${location.host}`;

        if (navigator.clipboard) {
            let url = `${origin}${location.pathname}?r=${boardId}`;
            navigator.clipboard.writeText(url).then(() => true, (e) => console.log("error", e));
        }
    }, [boardId]);

    let onClick = useCallback((evt) => {
        evt.stopPropagation();
        setCopying(true);
        if (timer.current) {
            clearTimeout(timer.current);
        }
        timer.current = setTimeout(() => {
            setCopying(false);
        }, 2000);
        copyLinkHandler(boardId);
    }, [boardId, copyLinkHandler]);

    let onHover = useCallback((evt) => {
        setHovered(evt.type === "pointerenter");
    }, []);

    let style = copying ? {backgroundColor: "#A4DAB0"} : {};

    let svg = copying
        ? "#img-checkmark"
        : (hovered ? "#img-link-white" : "#img-link");

    return (
        <div ref={targetRef} className="room-row-link-button" onClick={onClick} onPointerEnter={onHover} onPointerLeave={onHover} style={style}>
            <svg
                style={{
                    width: "20px",
                    height: "20px",
                }}
                viewBox="0 0 24 24">
                <use href={svg}></use>
            </svg>
            <Overlay target={targetRef.current} show={copying} placement="bottom">
                {(tProps) => (
                    <Tooltip id={`overlay-example-${boardId}`} {...tProps}>
                        URL copied to clipboard
                    </Tooltip>
                )}
            </Overlay>
        </div>
    );
}

function Occupants(props) {
    let {names, number, boardId} = props;

    if (names.length === 0) {
        return <div className="room-row-occupants-value">{number}</div>;
    }

    let namesDiv = names.map((n, i) => (<div key={`${n}${i}`}>{n}</div>));

    return (
        <OverlayTrigger
            key = {`occupancy-${boardId}`}
            placement={"bottom"}
            popperConfig={
                {modifiers: [{name: "offset", options: {offset: [0, 4]}}]}}
            overlay={(
                <Tooltip className="user-names-tooltip">
                    <div className="user-names-holder no-select">{namesDiv}</div>
                </Tooltip>
            )}>
            <div className="room-row-occupants-value">{number}</div>
        </OverlayTrigger>
    );
}

function Warning(props) {
    let {name, showing, handleDelete, handleWarningCancel} = props;

    let yesClick = () => {
        handleWarningCancel();
        handleDelete();
    };

    // let roomName = name.bold();

    let message = <span>Are you sure you want to delete the <b>{name}</b> Room? All contents inside this room will be deleted. <br/> This cannot be undone.</span>;

    let style = {display: showing ? "flex" : "none"}; //left: position.x, top: position.y, width: position.width};

    return (
        <div className="warning-dialog-background" style={style}>
            <div className="warning-dialog-body">
                <div className="warning-dialog-header">
                    <div className="warning-dialog-header-sign">!</div>
                </div>
                <div className="warning-dialog-message">{message}</div>
                <div className="warning-dialog-button-holder">
                    <Button
                        className="btn warning-dialog-no-button"
                        onClick={handleWarningCancel}>
                        {"Cancel"}
                    </Button>
                    <Button
                        className="btn btn-danger warning-dialog-yes-button"
                        onClick={yesClick}>
                        {"Delete"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export function SortHeader(props) {
    let {thisClass, labelClass, type, sortType, sortOrder, handler} = props;

    let cls = `cursor-pointer ${thisClass}`;

    if (type === "active-swatch") {
        return (
            <div onClick={() => handler("active")} className={cls}>
                <div className={labelClass} active="header"></div>
                <FilterIcon/>
            </div>
        );
    }

    return (
        <div onClick={() => handler(type)} className={cls}>
            <div className={labelClass}></div>
            <FilterIcon order={type === sortType ? sortOrder : null}/>
        </div>
    );
}

function FilterIcon(props) {
    let order = props.order; // a string starts with "a" or "d", or null

    let icon = !order
        ? "#img-filter"
        : order[0] === "a" ? "#img-filter-bottom" : "#img-filter-top";

    return (
        <div className="room-row-filter-icon-holder">
            <svg className="room-row-filter-icon" viewBox="0 0 24 24">
                <use href={icon}></use>
            </svg>
        </div>
    );
}

function GuestUserName(props) {
    let {onChange, nameRef, enterOverlayShowing} = props;
    let targetRef = useRef(null);

    let setting = (
        <TextSetting
            onChange={onChange}
            writable={true}
            originalContent={""}
            displayLabel="Guest User Name"
            nameRef={nameRef} />
    );

    return (
        <div ref={targetRef}>
            {setting}
            <Overlay target={targetRef.current} show={enterOverlayShowing} placement="bottom">
                {(tProps) => (
                    <Tooltip id={"overlay-guest-name"} {...tProps}>
                        Please enter your name
                    </Tooltip>
                )}
            </Overlay>
        </div>
    );
}

export function WaitFeedback(props) {
    let animatingRef = useRef(false);
    let startTime = useRef(-1);
    let duration = props.duration || 3500;

    let [angle, setAngle] = useState(-1, "angle");

    let circleRef = useRef(null);

    let circle = (rad) => {
        if (rad <= 0) {return;}
        if (!circleRef.current) {return;}

        let ctx = circleRef.current.getContext("2d");
        ctx.lineWidth = 8;
        ctx.strokeStyle = "#4CF048";
        ctx.clearRect(0, 0, 128, 128);
        ctx.beginPath();
        let hPi = 0.5 * Math.PI;
        ctx.arc(64, 64, 56, -hPi, rad - hPi);
        ctx.stroke();
    };

    let animationFrame = useCallback(() => {
        let now = Date.now();
        if (startTime.current > 0 && now - startTime.current < duration) {
            let rad = (now - startTime.current) / duration * Math.PI * 2;
            setAngle(rad);
            circle(rad);
            requestAnimationFrame(animationFrame);
        } else {
            animatingRef.current = false;
            setAngle(-1);
            startTime.current = -1;
        }
    }, [duration]);

    useEffect(() => {
        if (props.trigger > startTime.current && animatingRef.current === false) {
            animatingRef.current = true;
            startTime.current = props.trigger;
            requestAnimationFrame(animationFrame);
        } else if (props.trigger < 0) {
            startTime.current = -1;
        }
    }, [props.trigger, animationFrame]);

    let display = angle < 0 ? "none" : "flex";

    return (
        <div style={{display}} className="circle-holder">
            <canvas ref={circleRef} className="circle" width="128" height="128"></canvas>
        </div>
    );
}

export function SignOutButton(props) {
    let label = props.user && props.user.uid ? "Sign Out" : "Sign In";
    return (
        <span onClick={props.handleSignOut}>{label}</span>
    );
}

export function FeedbackPageButton(_props) {
    let label = "Help & Feedback";
    return (
        <span>{label}</span>
    );
}

export function initialsFrom(nickname) {
    if (!nickname) {return "";}

    let pieces = nickname.split(" ").filter(p => p.length > 0);

    if (pieces.length === 0) {return "";}
    if (pieces.length === 1) {
        return pieces[0].slice(0, 2).toUpperCase();
    }

    let name = pieces.map(p => p[0]);
    name = name[0] + name.slice(-1);
    return name.toUpperCase();
}
