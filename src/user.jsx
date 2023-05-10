import React, {useEffect, useRef, useCallback, useMemo} from "react";
import ReactDOM from "react-dom";
import {Dropdown, Row, Col} from "react-bootstrap";
import {Database} from "./firebase-loader";
import {BoardSettingsPage, Boards, TeamSettingsPage, BoardName, OpenBoardButton, NewTeamDialog, SettingsMenu1, MediaErrorMessage, CloseSettingsPageButton, VideoPreview, AudioPreview, MediaButton, TeamsMenu, UserName, UserPhoto, SignOutButton, WaitFeedback, initialsFrom, useState, GuestUserName, jsonUnescape} from "./components.jsx";

import {findGreenlight} from "./findGreenlight";

let initialURL = new URL(window.location.href);
let currentURL = window.location.href;
let audioFeedback;
let lastRenderErrorTime = null;
let audioHistory = [];

let _audioDeviceList = [];
let _videoDeviceList = [];

let _micState = "off";
let _videoState = "off";

let _audioSelection = {
    prev: {deviceId: undefined, label: undefined},
    current: {deviceId: undefined, label: undefined}
};

let _videoSelection = {
    prev: {deviceId: undefined, label: undefined},
    current: {deviceId: undefined, label: undefined}
};

let duplicator;

function cleanup() {
    if (Database) {
        Database.forgetAllSubscriptions();
    }

    ["#user-page"].forEach((n) => {
        let elem = document.querySelector(n);
        if (elem) {
            ReactDOM.unmountComponentAtNode(elem);
            elem.remove();
        }
    });

    ["#user-css", "#font-awesome", "#fa-v4-font-face", "#fa-v4-shim", "#fa-main"].forEach((n) => {
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

    let root = document.querySelector("#croquet-root");
    if (root) {
        root.style.setProperty("display", "inherit");
    }

    let loader = document.querySelector("#loader");
    if (loader) {
        loader.remove();
    }
}

function goToPage(html, optQ) {
    let origin = `${initialURL.protocol}//${initialURL.host}`;
    let pathname = initialURL.pathname;
    let ind = pathname.lastIndexOf("/");
    let path = pathname.slice(0, ind + 1);
    let query = optQ ? `q=${optQ}` : new URL(initialURL.href).searchParams;
    let str = query.toString();
    let question = str.length > 0 ? "?" : "";
    let newLocation = `${origin}${path}${html}${question}${str}`;
    window.location.assign(newLocation);
}

function goToLoginPage() {
    return goToPage("login.html");
}

function goToLandingPage(q) {
    return goToPage("landing.html", q);
}

function setURL(t, r) {
    let url;
    let origin = `${initialURL.protocol}//${initialURL.host}`;
    let pathname = initialURL.pathname;
    let query = new URL(initialURL.href).searchParams;

    if (!t && !r) {
        url = `${origin}${pathname}`;
    } else {
        query.delete("_");
        query.delete("t");
        query.delete("r");
        let marker = ""; //withMarker ? `&_=${withMarker}` : "";
        let newQuery = "";
        if (t) {
            newQuery += `t=${t}`;
        }

        if (r) {
            let a = newQuery.length > 0 ? "&" : "";
            newQuery += `${a}r=${r}`;
        }

        let str = query.toString();
        let ampersand = str.length > 0 ? "&" : "";

        url = `${origin}${pathname}?${newQuery}${marker}${ampersand}${str}`;
    }
    if (url === currentURL) { return; }

    currentURL = url;
    window.history.replaceState(null, "Q", url);
}

function initialURLCheck() {
    let searchParams = initialURL.searchParams;
    let params = Array.from(searchParams);
    let keylessParam = params.find(pair => pair[1] === "");
    let maybeGoToLandingPage = searchParams.get("q");
    if (keylessParam) { maybeGoToLandingPage = keylessParam[0];}
    let maybeSession = searchParams.get("r");
    let maybeTeam = searchParams.get("t");
    let boardPromise;
    let teamPromise;

    if (maybeGoToLandingPage) {
        goToLandingPage(maybeGoToLandingPage);
        return Promise.resolve(null);
    }

    if (maybeSession) {
        boardPromise = Database.getBoardInfo(maybeSession).then((boardInfo) => {
            return boardInfo;
        }).catch((_error) => {
            return null;
        });
    } else {
        boardPromise = Promise.resolve(null);
    }
    if (maybeTeam) {
        teamPromise = Database.getTeamInfo(maybeTeam).then((teamInfo) => {
            return teamInfo;
        }).catch((_error) => {
            return null;
        });
    } else {
        teamPromise = Promise.resolve(null);
    }

    return Promise.all([boardPromise, teamPromise]).then(([board, team]) => {
        if (board) {
            return {action: "goto", board, team};
        }
        if (team) {
            return {action: "gotoTeam", team};
        }
        return null;
    }).catch((_error) => {
        return null;
    });
}

function storeTeam(teamId) {
    if (!teamId) {return;}
    if (window.localStorage) {
        try {
            window.localStorage.setItem("userSelectedTeam", teamId);
        } catch (e) {
            console.log("error in writing to localStorage");
        }
    }
}

function checkLocallyStoredTeam() {
    if (window.localStorage) {
        try {
            return window.localStorage.getItem("userSelectedTeam");
        } catch (e) {
            console.log("error in reading from localStorage");
        }
    }
    return null;
}

function UserPage(_props) {
    const [user, setUser] = useState(undefined, "user"); // starts with undefined, and may become null
    const [userBoards, setUserBoards] = useState(null, "userBoards"); // connected to the user's userBoards data
    // const [userBoardsList, setUserBoardsList] = useState([], "userBoardsList");

    const [userBoardsFirstTime, setUserBoardsFirstTime] = useState(true, "userBoardsFirstTime");

    const [teamNames, setTeamNames] = useState([], "teamNames");
    const [teamBoardsList, setTeamBoardsList] = useState([], "teamBoardsList");

    const [currentTeam, setCurrentTeam] = useState(null, "currentTeam"); // teamId or null

    // {id: {boards: {id: true}, ownerIds: {id: true}, userIds: {id: true}, lastActivityTime: timestamp}
    const [currentTeamInfo, setCurrentTeamInfo] = useState(null, "currentTeamInfo");
    const [teamWritable, setTeamWritable] = useState(false, "teamWritable");

    const [teammateNames, setTeammateNames] = useState([], "teammateNames");

    // null or  boardId
    const [currentBoard, setCurrentBoard] = useState(null, "currentBoard");

    const [currentBoardInfo, setCurrentBoardInfo] = useState(null, "currentBoardInfo");
    const [boardWritable, setBoardWritable] = useState(false, "boardWritable");

    const [userMap, setUserMap] = useState({}, "userMap"); // {[boardId]: {activeViewIds: true}}

    const [boardOpenPageShown, setBoardOpenPageShown] = useState(false, "boardOpenPageShown");
    const [boardSettingsPageShown, setBoardSettingsPageShown] = useState(false, "boardSettingsPageShown");
    const [teamSettingsPageShown, setTeamSettingsPageShown] = useState(false, "teamSettingsPageShown");

    const [newTeamDialogShown, setNewTeamDialogShown] = useState(false);
    // const [boardWatcherTrigger, setBoardWatcherTrigger] = useState(null, "boardWatcherTrigger");

    const [boardWatcherQueue, setBoardWatcherQueue] = useState([], "boardWatcherQueue");

    const [teamWatcherTrigger, setTeamWatcherTrigger] = useState(null, "teamWatcherTrigger");
    const [newTeamRequestState, setNewTeamRequestState] = useState(null, "newTeamRequestState");
    // null | {teamWatcher: id|null, userBoardsWatcher: id|null, response: id|null}
    // requested -> (responseReceived(id), teamWatcher(id), userBoardsWatcher) -> selectBoard(id);

    const [newBoardRequestState, setNewBoardRequestState] = useState(null, "newBoardRequestState");
    // null | {containerWatcher: id|null, booardWatcher: id|null, response: id|null}

    const [userChangeRequestState, setUserChangeRequestState] = useState(null, "userChangeRequestState");

    const [waitFeedbackTriggerTime, setWaitFeedbackTriggerTime] = useState(-1);
    const [waitFeedbackDuration, setWaitFeedbackDuration] = useState(3500);
    const [teamsMenuIsOpen, setTeamsMenuIsOpen] = useState(false, "teamsMenuIsOpen");

    let teamMenuBackgroundRef = useRef(null);

    useEffect(() => {
        setBoardWritable(!!(currentBoard && currentBoardInfo && user && currentBoardInfo.ownerIds[user.uid]));
    }, [currentBoard, currentBoardInfo, user]);

    useEffect(() => {
        setTeamWritable(!!(currentTeam && currentTeamInfo && user && currentTeamInfo.ownerIds[user.uid]));
    }, [currentTeam, currentTeamInfo, user]);

    useEffect(() => {
        function messageListener(message) {
            if (message.data && message.data.duplicatorAction === "done") {
                if (duplicator) {
                    duplicator.remove();
                    duplicator = null;
                    setWaitFeedbackTriggerTime(-1);
                }
                selectBoard(message.data.id);
            }
        }
        window.addEventListener("message", messageListener);

        return () => {
            window.removeEventListener("message", messageListener);
        };
    }, [selectBoard]);

    useEffect(() => {
        Database.initDatabase().then(() => {
            return Database.getUser(null, (userInfo) => {
                setUser(userInfo);
            });
        }).catch(() => {
            setUser({name: "a b"});
        });
    }, []);

    useEffect(() => {
        if (!user || !user.uid) {return;}
        Database.getUserBoards((userBoardsInfo) => {
            setUserBoards(userBoardsInfo);
            return userBoardsInfo;
        }).then((userBoardsInfo) => {
            if (newTeamRequestState && newTeamRequestState.response) {
                if (userBoardsInfo.teams[newTeamRequestState.response]) {
                    updateNewTeamState("userBoardsWatcher", newTeamRequestState.response);
                }
            }
            return userBoardsInfo;
        }).catch((_error) => {
            console.log("somehow the userBoards is not available");
        });
    }, [user, newTeamRequestState, updateNewTeamState, newBoardRequestState, updateNewBoardState]);

    useEffect(() => {
        if (userBoards) {
            if (userBoardsFirstTime) {
                setUserBoardsFirstTime(false);
                let localTeam = checkLocallyStoredTeam();
                let query = new URL(initialURL.href).searchParams;
                if (localTeam && query.toString().length === 0) {
                    selectTeam(localTeam);
                    return;
                }
            }
            let teams = Object.keys(userBoards.teams);
            if (teams.length === 1) {
                selectTeam(teams[0]);
            }
        }
    }, [userBoards, userBoardsFirstTime, selectTeam]);

    useEffect(() => {
        if (user === undefined) { return; }

        initialURLCheck().then((info) => {
            if (info && info.action === "goto") {
                if (!info.board) {
                    console.log("room not available");
                    if (!user || !user.uid) {
                        throw new Error("board not available");
                    }
                    selectBoard(null);
                } else {
                    // selectBoard will select team its team, but here we might have to override it
                    selectBoard(info.board.id, info.team ? info.team.id : null);
                }
                return true;
            }
            if (info && info.action === "gotoTeam") {
                if (!info.team) {
                    console.log("team not available");
                    setCurrentTeam(null);
                    selectBoard(null);
                    if (!user || !user.uid) {
                        throw new Error("team not available");
                    }
                } else {
                    setCurrentTeam(info.team.id);
                    setCurrentTeamInfo(oldInfo => {
                        forgetAllTeamBoards(oldInfo);
                        return info.team;
                    });
                    selectBoard(null);
                }
                return true;
            }
            return false;
        }).then((withURL) => {
            if (!withURL) {
                setCurrentTeam(null);
                selectBoard(null);
                if (user && !user.uid) {
                    // a guest user: if no URL parameter is specified, redirect to the login page
                    throw new Error("not logged in");
                }
            }
        }).catch((error) => {
            console.log("not signed in, or an error", error);
            goToLoginPage();
        });
    }, [user, selectBoard]);

    useEffect(() => {
        if (currentBoardInfo) {
            if (boardOpenPageShown || boardSettingsPageShown) {
                let marker;
                if (boardOpenPageShown) {
                    marker = "1";
                }
                if (boardSettingsPageShown) {
                    marker = "2";
                }
                setURL(currentTeam, currentBoardInfo.id, marker);
                return;
            }
        }
        setURL(currentTeam, null, false);
    }, [currentBoardInfo, currentTeam, boardOpenPageShown, boardSettingsPageShown]);

    useEffect(() => {
        if (currentTeamInfo) {
            let obj = {...currentTeamInfo.ownerIds, ...currentTeamInfo.userIds};
            let promises = [];
            for (let k in obj) {
                promises.push(Database.getUser(k));
            }
            Promise.all(promises).then((array) => {
                let sorted = array.map((u) => ({name: u.name, id: u.uid}));
                sorted.sort((a, b) => {
                    if (a.name < b.name) return -1;
                    if (a.name > b.name) return 1;
                    return 0;
                });
                setTeammateNames(sorted);
            }).catch((_error) => {
                setTeammateNames([]);
            });
        }
    }, [currentTeamInfo]);

    useEffect(() => {
        //console.log("currentTeamInfo -> boardsList");
        if (currentTeamInfo) {
            teamBoardsListFromCurrentTeam(currentTeamInfo);
        }
    }, [currentTeamInfo, teamBoardsListFromCurrentTeam]);

    const forgetAllTeamBoards = (oldTeamInfo) => {
        if (oldTeamInfo) {
            for (let boardId in oldTeamInfo.boards) {
                Database.forgetBoard(boardId);
            }
        }
    };

    const selectBoard = useCallback((id, optDifferentTeam, openSettingDialog) => {
        setCurrentBoard(id);
        if (id) {
            Database.getBoardInfo(id, boardWatcher, boardError).then((boardInfo) => {
                if (optDifferentTeam) {
                    Database.getTeamInfo(optDifferentTeam, teamWatcher, teamError).then((teamInfo) => {
                        if (teamInfo) {
                            setCurrentTeam(teamInfo.id);
                            setCurrentTeamInfo(oldInfo => {
                                forgetAllTeamBoards(oldInfo);
                                return teamInfo;
                            });
                        }
                    });
                }
                setCurrentBoardInfo(boardInfo);
                setBoardOpenPageShown(!openSettingDialog);
                setBoardSettingsPageShown(!!openSettingDialog);
            });
        } else {
            setCurrentBoardInfo(null);
            setBoardOpenPageShown(false);
            setBoardSettingsPageShown(false);
        }
    }, [boardWatcher, boardError, teamWatcher, teamError]);

    useEffect(() => {
        if (userBoards) {
            teamNamesFromUserBoards(userBoards);
            if (currentTeam && !userBoards.teams[currentTeam]) {
                selectTeam(null);
            }
        }
    }, [userBoards, currentTeam, selectTeam, teamNamesFromUserBoards]);

    useEffect(() => {
        setBoardWatcherQueue((prev) => {
            if (prev.length === 0) {return prev;}
            let queue = [...prev];
            queue.forEach((boardInfo) => {
                setUserMap((prevMap) => {
                    let newMap = prevMap;
                    let map = makeUserMap(boardInfo);
                    newMap[boardInfo.id] = map;
                    return newMap;
                });

                updateBoardInfoInTeamBoards(boardInfo);
                if (boardInfo.id === currentBoard) {
                    setCurrentBoardInfo(boardInfo);
                }
                updateNewBoardState("boardWatcher", boardInfo.id);
                updateUserChangeRequestState("list", boardInfo.id);
                boardInfo = prev.shift();
            });

            prev.length = 0;
            return prev;
        });

    }, [currentBoard, boardWatcherQueue, userBoards, currentTeamInfo, updateNewBoardState, updateUserChangeRequestState]);

    useEffect(() => {
        if (currentTeamInfo) {
            let newTeamNames = [...teamNames];
            let index = newTeamNames.findIndex(o => o.id === currentTeamInfo.id);
            if (index >= 0 && newTeamNames[index].name !== currentTeamInfo.name) {
                newTeamNames[index] = {name: currentTeamInfo.name, id: currentTeamInfo.id};
                setTeamNames(newTeamNames);
            }
        }
    }, [currentTeamInfo, teamNames]);

    useEffect(() => {
        if (teamWatcherTrigger) {
            let teamDoc = teamWatcherTrigger;
            setTeamWatcherTrigger(null);
            updateNewTeamState("teamWatcher", teamDoc.id);

            if (newBoardRequestState && newBoardRequestState.response) {
                if (teamDoc.boards[newBoardRequestState.response]) {
                    updateNewBoardState("containerWatcher", newBoardRequestState.response);
                }
            }

            if (newTeamRequestState && newTeamRequestState.response) {
                if (teamDoc.id === newTeamRequestState.response) {
                    updateNewTeamState("teamWatcher", newTeamRequestState.response);
                }
            }

            if (userChangeRequestState && userChangeRequestState.response) {
                if (teamDoc.id === userChangeRequestState.response) {
                    updateUserChangeRequestState("list", userChangeRequestState.response);
                }
            }

            if (currentTeamInfo && currentTeamInfo.id === teamDoc.id) {
                setCurrentTeamInfo(oldInfo => {
                    forgetAllTeamBoards(oldInfo);
                    return teamDoc;
                });
            }
        }
    }, [teamWatcherTrigger, currentTeamInfo, newTeamRequestState, updateNewTeamState, newBoardRequestState, updateNewBoardState, updateUserChangeRequestState, userChangeRequestState]);

    const selectSettings = useCallback((id) => {
        setCurrentBoard(id);
        Database.getBoardInfo(id, boardWatcher, boardError).then((boardInfo) => {
            setCurrentBoardInfo(boardInfo);
            setBoardOpenPageShown(false);
            setBoardSettingsPageShown(true);
        });
    }, [boardWatcher, boardError]);

    const makeUserMap = (boardInfo) => {
        let activeViewIds = boardInfo.activeViewIds;

        let userSorter = (a, b) => {
            let time = (c) => c.time ? c.time.toMillis() : 0;
            return time(a) - time(b);
        };

        let sorted = [];
        for (let k in activeViewIds) {
            let entry = activeViewIds[k];
            sorted.push(entry); //{uid, lastActivityTime}
        }

        sorted.sort(userSorter);
        return sorted;
    };

    const teamNamesFromUserBoards = useCallback((userBoardsInfo) => {
        if (userBoardsInfo) {
            let promises = [];
            for (let teamId in userBoardsInfo.teams) {
                let p = Database.getTeamInfo(teamId, teamWatcher, teamError).catch((_e) => null);
                promises.push(p);
            }
            Promise.all(promises).then((info) => {
                setTeamNames(info.filter(i => i).map(m => {
                    return {name: jsonUnescape(m.name), id: m.id};
                }));
            });
        } else {
            setTeamNames([]);
        }
    }, [teamWatcher, teamError]);

    const teamBoardsListFromCurrentTeam = useCallback((teamInfo) => {
        // console.log(teamInfo);
        const boardSorter = (a, b) => {
            let time = (c) => c.lastActivityTime ? c.lastActivityTime.toMillis() : 0;
            return time(b) - time(a);
        };
        if (teamInfo) {
            let promises = [];
            for (let k in teamInfo.boards) {
                promises.push(Database.getBoardInfo(k, boardWatcher, boardError));
            }
            Promise.all(promises).then((array) => {
                array.sort(boardSorter);
                setTeamBoardsList(array);
            });
        } else {
            setTeamBoardsList([]);
        }
    }, [boardWatcher, boardError]);

    const boardWatcher = useCallback((boardInfo) => {
        setBoardWatcherQueue((prev) => {
            let newQueue = [...prev];
            newQueue.push(boardInfo);
            return newQueue;
        });
    }, []);

    const newBoard = useCallback((isUserBoard) => {
        let name = "Untitled";
        let teamId = isUserBoard ? null : currentTeam;
        setWaitFeedbackDuration(0); // default
        setWaitFeedbackTriggerTime(Date.now());
        Database.addBoard(name, teamId, boardWatcher).then((board) => {
            console.log(`room ${board.data.id} added`);
            updateNewBoardState("response", board.data.id);
        }).catch((error) => {
            console.log("room creation failed", error);
        });
    }, [boardWatcher, currentTeam, updateNewBoardState]);

    const updateCurrentBoard = useCallback((newValue) => {
        if (!newValue) {
            setCurrentBoard(null);
        } else {
            Database.updateBoardInfo(currentBoard, newValue);
            let newInfo = {...currentBoardInfo, ...newValue};
            setCurrentBoardInfo(newInfo);
        }
    }, [currentBoard, currentBoardInfo]);

    const updateCurrentTeam = useCallback((newValue) => {
        if (!newValue) {
            setCurrentTeam(null);
            setCurrentTeamInfo(oldInfo => {
                forgetAllTeamBoards(oldInfo);
                return null;
            });
        } else {
            Database.updateTeamInfo(currentTeam, newValue);
            let newInfo = {...currentTeamInfo, ...newValue};
            setCurrentTeamInfo(oldInfo => {
                forgetAllTeamBoards(oldInfo);
                return newInfo;
            });
        }
    }, [currentTeam, currentTeamInfo]);

    const handleSignOut = useCallback(() => {
        Database.signOut();
        goToLoginPage();
    }, []);

    const handleDuplicate = useCallback(() => {
        let iframe = document.createElement("iframe");

        if (!currentBoardInfo) {return;}
        let id = currentBoardInfo.id;
        let name = `copy of ${currentBoardInfo.name}`;
        iframe.src = `duplicator.html?r=${id}&duplicate=${name}`;

        document.body.appendChild(iframe);
        duplicator = iframe;

        setWaitFeedbackDuration(20000); // longer
        setWaitFeedbackTriggerTime(Date.now());
    }, [currentBoardInfo]);

    const handleDelete = useCallback(() => {
        if (!currentBoard) {return;}
        let boardId = currentBoard;
        selectBoard(null);
        setBoardOpenPageShown(false);
        setBoardSettingsPageShown(false);
        setWaitFeedbackDuration(0); // default
        setWaitFeedbackTriggerTime(Date.now());
        Database.deleteBoard({ boardId }).then((data) => {
            let responseId = data.data.id;
            console.log("deleteBoard", responseId);
        }).catch((error) => {
            console.log("deleteBoard failed", error);
        });
    }, [currentBoard, selectBoard]);

    const handleNewTeam = useCallback((name) => {
        if (!name) {
            name = "Unnamed Team";
        }
        setNewTeamDialogShown(false);
        setWaitFeedbackDuration(0); // default
        setWaitFeedbackTriggerTime(Date.now());
        Database.addTeam(name).then((data) => {
            console.log(`team ${data.data} added`);
            updateNewTeamState("response", data.data);
            // teamwatcher will be triggered. I might have to remember the id here and go there in teamWatcher
        }).catch((error) => {
            console.log(`adding a team failed`, error);
        });
    }, [updateNewTeamState]);

    const teamBoardsCategoryRef = useRef(null);

    const updateNewTeamState = useCallback((newKey, id) => {
        if (newKey === "response") {
            setNewTeamRequestState({response: id});
            return;
        }

        const kickTeamHighlight = () => {
            if (teamBoardsCategoryRef.current) {
                let elem = teamBoardsCategoryRef.current;
                setTimeout(() => {
                    if (elem) {
                        elem.style.removeProperty("background-color");
                    }
                }, 1000);

                elem.style.setProperty("background-color", "#a0a0a0", "important");
            }
        };
        if (newTeamRequestState && newTeamRequestState.response === id) {
            if (newTeamRequestState[newKey] === id) {return;}
            let newValue = {...newTeamRequestState, [newKey]: id};
            if (newValue.teamWatcher && newValue.userBoardsWatcher && newValue.response) {
                window.setTimeout(kickTeamHighlight, 500);
                setWaitFeedbackTriggerTime(-1);
                setNewTeamRequestState(null);
                selectTeam(id, true);
            } else {
                setNewTeamRequestState(newValue);
            }
        }
    }, [selectTeam, newTeamRequestState]);

    const updateNewBoardState = useCallback((newKey, id) => {
        if (newKey === "response") {
            setNewBoardRequestState({response: id});
            return;
        }

        const kickBoardHighlight = () => {
            let categoryRef = teamBoardsCategoryRef;
            if (!categoryRef.current) {return;}
            let rects = categoryRef.current.querySelectorAll(".board-thumbnail");
            if (!rects || rects.length < 1) {return;}
            let rect = rects[1];
            setTimeout(() => {
                if (rect) {
                    rect.style.removeProperty("background-color");
                }
            }, 1000);
            rect.style.setProperty("background-color", "#a0a0a0");
        };
        if (newBoardRequestState && newBoardRequestState.response === id) {
            if (newBoardRequestState[newKey] === id) { return; }
            let newValue = {...newBoardRequestState, [newKey]: id};
            if (newValue.boardWatcher && newValue.containerWatcher && newValue.response) {
                kickBoardHighlight(id);
                setWaitFeedbackTriggerTime(-1);
                setNewBoardRequestState(null);
                selectBoard(id, null, true);
            } else {
                setNewBoardRequestState(newValue);
            }
        }
    }, [selectBoard, newBoardRequestState]);

    const updateUserChangeRequestState = useCallback((newKey, id) => {
        if (newKey === "response") {
            setUserChangeRequestState({response: id});
            return;
        }
        if (userChangeRequestState && userChangeRequestState.response === id) {
            if (userChangeRequestState[newKey] === id) {return;}
            let newValue = {...userChangeRequestState, [newKey]: id};
            if (newValue["list"] && newValue["response"]) {
                setWaitFeedbackTriggerTime(-1);
            } else {
                setUserChangeRequestState(newValue);
            }
        }
    }, [/*selectBoard, */userChangeRequestState]);

    const updateBoardInfoInTeamBoards = (boardInfo) => {
        const boardSorter = (a, b) => {
            let time = (c) => c.lastActivityTime ? c.lastActivityTime.toMillis() : 0;
            return time(b) - time(a);
        };
        setTeamBoardsList((prev) => {
            let array = [...prev];
            let index = prev.findIndex((b) => b.id === boardInfo.id);
            if (index < 0) {
                array.push(boardInfo);
            } else {
                array[index] = boardInfo;
            }
            array.sort(boardSorter);
            return array;
        });
    };

    const closeNewTeamDialog = () => setNewTeamDialogShown(false);

    const handleTeamDelete = useCallback(() => {
        if (!currentTeam) {return;}
        let teamId = currentTeam;
        setBoardOpenPageShown(false);
        setBoardSettingsPageShown(false);
        setTeamSettingsPageShown(false);
        selectBoard(null);
        setWaitFeedbackDuration(0); // default
        setWaitFeedbackTriggerTime(Date.now());
        Database.deleteTeam({teamId}).then((data) => {
            let responseId = data.data.id;
            console.log("deleteTeam", responseId);
            selectTeam(null);
        }).catch((error) => {
            console.log("deleteTeam failed", error);
        });
    }, [currentTeam, selectBoard, selectTeam]);

    const teamWatcher = useCallback((teamDoc) => {
        //console.log("team watcher: ", teamDoc);
        setTeamWatcherTrigger(teamDoc);
    }, []);

    const teamError = useCallback((_id) => {
        console.log("team error occured");
        setTeamSettingsPageShown(false);
        selectBoard(null);
        selectTeam(null);
        setWaitFeedbackTriggerTime(-1);
    }, [selectTeam, selectBoard]);

    const boardError = useCallback((_id) => {
        console.log("board error occured");
        setBoardSettingsPageShown(false);
        selectBoard(null);
        setWaitFeedbackTriggerTime(-1);
    }, [selectBoard]);

    const selectTeam = useCallback((teamId, openSettingsDialog) => {
        if (!teamId) {
            if (!user || !user.uid) {
                setTeamSettingsPageShown(false);
                setCurrentTeam(null);
                setCurrentTeamInfo(oldInfo => {
                    forgetAllTeamBoards(oldInfo);
                    return null;
                });
                teamBoardsListFromCurrentTeam(null);
                setTeammateNames([]);
                return;
            }
            teamId = user.uid;
        }
        if (userBoards) {
            Database.getTeamInfo(teamId, teamWatcher).then((teamInfo) => {
                setCurrentTeam(teamId);
                setCurrentTeamInfo(oldInfo => {
                    forgetAllTeamBoards(oldInfo);
                    return teamInfo;
                });
                setTeamSettingsPageShown(!!openSettingsDialog);
            });
        }
    }, [userBoards, teamBoardsListFromCurrentTeam, teamWatcher, user]);

    const updateBoardUser = useCallback((type, id) => {
        if (!currentBoard) {return;}
        setWaitFeedbackDuration(0); // default
        setWaitFeedbackTriggerTime(Date.now());
        Database.updateBoardUser({
            boardId: currentBoard,
            userId: id, type: type
        }).then((data) => {
            console.log(type, data);
            updateUserChangeRequestState("response", currentBoard);
        }).catch((error) => {
            console.log(type + " failed", error);
        });
    }, [updateUserChangeRequestState, currentBoard]);

    const addOwnerToBoard = useCallback((id) => {
        updateBoardUser("addOwner", id);
    }, [updateBoardUser]);

    const removeOwnerFromBoard = useCallback((id) => {
        updateBoardUser("removeOwner", id);
    }, [updateBoardUser]);

    const addUserToBoard = useCallback((id) => {
        updateBoardUser("addUser", id);
    }, [updateBoardUser]);

    const removeUserFromBoard = useCallback((id) => {
        updateBoardUser("removeUser", id);
    }, [updateBoardUser]);

    const updateTeamUser = useCallback((type, id) => {
        if (!currentTeamInfo) {return;}
        setWaitFeedbackDuration(0); // default
        setWaitFeedbackTriggerTime(Date.now());
        Database.updateTeamUser({
            teamId: currentTeamInfo.id,
            userId: id,
            type: type
        }).then((data) => {
            console.log(type, data.data.id);
            updateUserChangeRequestState("response", currentTeamInfo.id);
        }).catch((error) => {
            console.log(type + " failed", error);
        });
    }, [updateUserChangeRequestState, currentTeamInfo]);

    const addOwnerToTeam = useCallback((id) => {
        updateTeamUser("addOwner", id);
    }, [updateTeamUser]);

    const removeOwnerFromTeam = useCallback((id) => {
        updateTeamUser("removeOwner", id);
    }, [updateTeamUser]);

    const addUserToTeam = useCallback((id) => {
        updateTeamUser("addUser", id);
    }, [updateTeamUser]);

    const removeUserFromTeam = useCallback((id) => {
        updateTeamUser("removeUser", id);
    }, [updateTeamUser]);

    const onTeamSettingsClick = useCallback(() => {
        setTeamSettingsPageShown(!teamSettingsPageShown);
    }, [teamSettingsPageShown]);

    const selectTeamHandler = useCallback((teamId) => {
        selectTeam(teamId);
        storeTeam(teamId);
    }, [selectTeam]);

    let teammateDivs = teammateNames.map((u) => {
        return <div className="floor-name" id={u.id} key={u.id}><span>{`${jsonUnescape(u.name)}`}</span></div>;
    });

    let organizationButtonDisabled = currentTeam ? "" : "disabled";
    let teamMenuBackgroundDisplay = teamsMenuIsOpen ? "inherit" : "none";

    return (
        <div className="user-page-top">
            <div className="user-page" id="wrapper">
                <div className="shadow-sm bg-white sidebar Row">
                    <div className="sidebar-logo no-select"></div>
                    <div className="Col mt-4 pt-3">
                        <div className="members mx-4">
                            <div className="members-title no-select">MEMBERS</div>
                            {teammateDivs}
                        </div>
                    </div>

                    <div className="organization-settings">
                        <div className={`btn btn-settings btn-organization d-block mx-auto ${organizationButtonDisabled}`} onClick={currentTeam ? onTeamSettingsClick : null}>organization settings</div>
                    </div>
                </div>

                <div className="page-wrapper">
                    <div className="bg-white shadow-sm">
                        <Row className="header-nav">
                            <Col lg={4} xs={0} className="clear-column"></Col>
                            <Col lg={6} sm={8} xs={5} className="d-flex align-items-center px-3">
                                <span className="organizationMenuLabel text-uppercase px-4">organization:</span>
                                <TeamsMenu selectTeamHandler={selectTeamHandler} teamNames={teamNames} current={currentTeamInfo ? { id: currentTeamInfo.id, name: currentTeamInfo.name } : null} writable={!!(user && user.uid)} newTeamDialogShown={newTeamDialogShown} setNewTeamDialogShown={setNewTeamDialogShown} setTeamsMenuIsOpen={setTeamsMenuIsOpen} teamsMenuIsOpen={teamsMenuIsOpen} backgroundRef={teamMenuBackgroundRef}/>
                            </Col>
                            <Col sm={2} xs={6} className="ml-auto pt-3">
                                <Dropdown className="float-right">
                                    <Dropdown.Toggle id="dropdown-basic">
                                        <UserPhoto url={user ? user.photoURL : null} initials={user ? user.initials : ""} />
                                    </Dropdown.Toggle>
                                    <Dropdown.Menu>
                                        <Dropdown.Header>
                                            <UserName userName={user ? user.name : "Guest"} />
                                        </Dropdown.Header>
                                        <Dropdown.Item>
                                            <SignOutButton handleSignOut={handleSignOut} user={user} />
                                        </Dropdown.Item>
                                    </Dropdown.Menu>
                                </Dropdown>
                            </Col>
                        </Row>
                    </div>
                    <Boards userMap={userMap} user={user} team={currentTeamInfo ? currentTeamInfo.name : null} teamBoardsList={teamBoardsList} teamWritable={teamWritable} newBoard={newBoard} selectBoard={selectBoard} selectSettings={selectSettings} setTeamSettingsPageShown={setTeamSettingsPageShown} teamSettingsPageShown={teamSettingsPageShown} teamBoardsCategoryRef={teamBoardsCategoryRef} />
                </div>
            </div>
            <BoardPage setBoardOpenPageShown={setBoardOpenPageShown} setBoardSettingsPageShown={setBoardSettingsPageShown} boardOpenPageShown={boardOpenPageShown} currentBoard={currentBoard} currentBoardInfo={currentBoardInfo} updateCurrentBoard={updateCurrentBoard} user={user} />
            <BoardSettingsPage user={user} handleDelete={handleDelete} handleDuplicate={handleDuplicate} setBoardOpenPageShown={setBoardOpenPageShown} setBoardSettingsPageShown={setBoardSettingsPageShown} writable={boardWritable} teamWritable={teamWritable} boardSettingsPageShown={boardSettingsPageShown} currentBoard={currentBoard} currentBoardInfo={currentBoardInfo} updateCurrentBoard={updateCurrentBoard} addOwnerToBoard={addOwnerToBoard} addUserToBoard={addUserToBoard} removeOwnerFromBoard={removeOwnerFromBoard} removeUserFromBoard={removeUserFromBoard} />
            <TeamSettingsPage user={user} handleDelete={handleTeamDelete} setTeamSettingsPageShown={setTeamSettingsPageShown} teamWritable={teamWritable} teamSettingsPageShown={teamSettingsPageShown} currentTeam={currentTeam} currentTeamInfo={currentTeamInfo} updateCurrentTeam={updateCurrentTeam} addOwnerToTeam={addOwnerToTeam} addUserToTeam={addUserToTeam} removeOwnerFromTeam={removeOwnerFromTeam} removeUserFromTeam={removeUserFromTeam} />
            <NewTeamDialog closeDialog={closeNewTeamDialog} newTeamDialogShown={newTeamDialogShown} setNewTeamDialogShown={setNewTeamDialogShown} openHandler={handleNewTeam} />
            <WaitFeedback trigger={waitFeedbackTriggerTime} duration={waitFeedbackDuration}/>
            <div className="teams-menu-modal-background" style={{display: teamMenuBackgroundDisplay}} onClick={() => setTeamsMenuIsOpen(false)}></div>
        </div>
    );
}

function BoardPage(props) {
    let currentBoardInfo = props.currentBoardInfo;
    let currentTeamInfo = props.currentTeamInfo;
    let boardName = currentBoardInfo ? currentBoardInfo.name : "";
    let boardId = currentBoardInfo ? currentBoardInfo.id : null;
    let teamName = currentTeamInfo ? currentTeamInfo.name : "";
    let teamId = currentTeamInfo ? currentTeamInfo.id : null;
    let publicBoard = currentBoardInfo && currentBoardInfo.access === "public";
    let chat = (currentBoardInfo && currentBoardInfo.chat) || "default";
    let videoChat = chat === "default" || chat === "videoOnly";

    let user = useMemo(() => props.user || {}, [props.user]);

    let {updateCurrentBoard, boardOpenPageShown, setBoardOpenPageShown, setBoardSettingsPageShown} = props;

    let guestNameRef = useRef(null);

    const [micState, setMicState] = useState("off", "micState");
    const [videoState, setVideoState] = useState("off", "videoState");

    const [openButtonPressed, setOpenButtonPressed] = useState(false, "openButtonPressed"); // user has pressed the button to open a room

    const [audioSelection, setAudioSelection] = useState({
        prev: {deviceId: undefined, label: undefined},
        current: {deviceId: undefined, label: undefined}
    }, "audioSelection");
    const [videoSelection, setVideoSelection] = useState({
        prev: {deviceId: undefined, label: undefined},
        current: {deviceId: undefined, label: undefined}
    }, "videoSelection");

    const [mediaTested, setMediaTested] = useState(null, "mediaTested");
    // null: not tested, true: succeeded, false; failed
    const [audioDeviceList, setAudioDeviceList] = useState([], "audioDeviceList");
    const [videoDeviceList, setVideoDeviceList] = useState([], "videoDeviceList");

    const [showVideoErrorMessage, setShowVideoErrorMessage] = useState(false);
    const [showAudioErrorMessage, setShowAudioErrorMessage] = useState(false);

    // null: not required. "": required but not filled. <string>: required and filled
    const [guestName, setGuestName] = useState(null);

    // const [audioFeedback, setAudioFeedback] = useState(null, "audioFeedback");

    const [reallyChangeState, setReallyChangeState] = useState(null, "reallyChangeState");
    const [prevCurrentBoardInfo, setPrevCurrentBoardInfo] = useState(null, "prevCurrentBoardInfo");

    const videoPreviewRef = useRef(null);
    const audioPreviewRef = useRef(null);

    useEffect(() => {
        if (boardOpenPageShown && prevCurrentBoardInfo === null && currentBoardInfo !== null) {
            setPrevCurrentBoardInfo(currentBoardInfo);
            setReallyChangeState(true);
        } else if (!boardOpenPageShown && prevCurrentBoardInfo !== null) {
            setPrevCurrentBoardInfo(null);
            setReallyChangeState(false);
        }
    }, [prevCurrentBoardInfo, currentBoardInfo, boardOpenPageShown]);

    useEffect(() => {
        if (!navigator.mediaDevices.ondevicechange) {
            navigator.mediaDevices.ondevicechange = reenumerateDevices;
        }
        return () => {navigator.mediaDevices.ondevicechange = null;};
    }, [reenumerateDevices]);

    useEffect(() => {
        if (reallyChangeState !== null) {
            setReallyChangeState(null);
            if (reallyChangeState) {
                if (!videoChat) {
                    setMicState("off");
                    setVideoState("off");
                    return;
                }
                setMicState("on");
                setVideoState("on");
                testInitMedia().then(({videoOk, audioOk}) => {
                    _micState = !videoChat || !audioOk ? "unavailable" : "on";
                    setMicState(_micState);
                    _videoState = !videoChat || !videoOk ? "unavailable" : "on";
                    setVideoState(_videoState);
                    return initMedia({video: videoOk, audio: audioOk});
                }).then((flag) => {
                    // initMedia will have returned null if the open button has been pressed
                    if (flag) {
                        reenumerateDevices();
                    }
                });
            } else {
                stopVideoPreview();
                stopAudioFeedback();
                // return Promise.resolve(false);
            }
        }
        // return  Promise.resolve(false);
    }, [stopAudioFeedback, stopVideoPreview, reallyChangeState, enumerateDevices, testInitMedia, initMedia, reenumerateDevices, videoChat]);

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
        setOpenButtonPressed(true);
        stopVideoPreview();
        stopAudioFeedback();
        Database.getUser(null).then((u) => {
            if (!u && !publicBoard) {
                // the latter should be prevented but here it is the last check
                return null;
            }
            if (user && !user.uid && guestName) {
                user.name = guestName;
            }
            return user.name;
        }).then((nickname) => {
            // @@ null nickname indicates that the board is now not
            // public, and the user doesn't have permission to enter.
            // this presumably happened after this user opened the
            // room-entry dialog.
            if (!nickname) return;

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
        });
    }, [boardId, boardName, guestName, publicBoard, stopAudioFeedback, stopVideoPreview, teamId, teamName, user, chat, videoChat]);

    const handleCloseBoardPage = useCallback(() => {
        if (user && !user.uid) {
            goToLoginPage();
            return;
        }
        updateCurrentBoard(null);
        setBoardOpenPageShown(false);
        setBoardSettingsPageShown(false);
    }, [setBoardOpenPageShown, setBoardSettingsPageShown, updateCurrentBoard, user]);

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

    const setupAudioFeedback = useCallback((stream) => {
        if (stream.getAudioTracks().length === 0) {
            console.log("video only stream, perhaps for screen share");
            return;
        }

        let process = (data) => {
            if (!audioFeedback) {
                // already closed;
                return -1;
            }

            let oldTime = audioFeedback.time;
            let nowTime = Date.now();
            if (nowTime < oldTime + 100) {return -1;}
            audioFeedback.time = nowTime;
            let max = 0;
            let buf = data.inputBuffer.getChannelData(0);
            for (let i = 0; i < buf.length; i++) {
                max = Math.max(max, Math.abs(buf[i]));
            }
            max = Math.max((max * 10 - 0.5), 0); // hmm
            return max;
        };

        let context = new (window.AudioContext || window.webkitAudioContext)();
        let cloned = null; //stream.clone();
        let input = context.createMediaStreamSource(stream); // cloned
        let processor = context.createScriptProcessor(1024, 1, 1);
        processor.onaudioprocess = (e) => {
            let v = process(e);
            if (v >= 0) {
                renderAudioFeedback(v);
            }
        };

        input.connect(processor);
        processor.connect(context.destination);

        audioFeedback = {stream, context, input, cloned, processor, time: 0};
    }, [renderAudioFeedback]);

    const stopAudioFeedback = useCallback(() => {
        let audio = audioFeedback;
        if (!audio) {return;}

        // on iPad, at least, it seems that if you stop the audio you won't get it back
        const isIPad = navigator.userAgent.match(/\biPad\b/);
        const stopTracks = !isIPad;
        console.log("stop audioFeedback", audioFeedback, `stopTracks=${stopTracks}`);

        if (audio.input) {
            audio.input.disconnect();
        }
        if (audio.processor) {
            audio.processor.disconnect();
        }
        if (audio.context) {
            audio.context.close();
        }
        if (audio.clone) {
            audio.clone.getTracks().forEach(track => track.stop());
        }

        if (audio.stream && stopTracks) {
            audio.stream.getTracks().forEach(track => track.stop());
        }

        audioFeedback = null;

        let audioPreview = audioPreviewRef.current;
        if (!audioPreview) {return;}
        let ctx = audioPreview.getContext('2d');
        let width = audioPreview.width;
        let totalHeight = audioPreview.height;
        ctx.clearRect(0, 0, width, totalHeight);
    }, []);

    const testInitMedia = useCallback(() => {
        console.log("testInitMedia: ", mediaTested);
        // this test is only run once.

        if (!navigator.mediaDevices.getUserMedia) {
            let v = {videoOk: false, audioOk: false};
            setMediaTested(v);
            return Promise.resolve(v);
        }

        if (mediaTested !== null) {
            return Promise.resolve(mediaTested);
        }

        const video = navigator.mediaDevices.getUserMedia({
            video: {
                frameRate: 12,
                aspectRatio: 1.33,
                width: 240,
                height: 240 / 1.33,
                resizeMode: "crop-and-scale",
            }
        }).then((stream) => {
            console.log("video test succeeded");
            stream.getTracks().forEach(t => t.stop());
            return true;
        }).catch((err) => {
            console.log("video test failed: " + err.name);
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
            stream.getTracks().forEach(t => t.stop());
            return true;
        }).catch((err) => {
            console.log("audio test failed: " + err.name);
            // shift any existing device from current to prev,
            // and clear current
            let [_achanged, aValue] = updateInputState("audio", null, false);
            _audioSelection = aValue;
            setAudioSelection(aValue);
            _micState = "unavailable";
            setMicState(_micState);
            setShowAudioErrorMessage(true);
            return false;
        });

        return Promise.all([video, audio]).then(([videoOk, audioOk]) => {
            setMediaTested({videoOk, audioOk});
            return {videoOk, audioOk};
        });
    }, [updateInputState, mediaTested]);

    const initVideoMedia = useCallback(() => {
        let videoPreview = videoPreviewRef.current;
        if (_videoSelection.current.deviceId) {
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
            }).then((stream) => {
                console.log("video init succeeded");
                stopVideoPreview();
                if (openButtonPressed) {
                    stream.getTracks().forEach(t => t.stop());
                    return false;
                }
                videoPreview.srcObject = stream;
                videoPreview.onloadedmetadata = () => {
                    videoPreview.play();
                    _videoState = "on";
                    setVideoState(_videoState);
                };
                return true;
            }).catch((err) => {
                console.log("video init failed: " + err.name);
                let [changed, newValue] = updateInputState("video", null, false);
                if (changed) {
                    _videoSelection = newValue;
                    setVideoSelection(newValue);
                }
                _videoState = "unavailable";
                setVideoState(_videoState);
                return false;
            });
        }
        stopVideoPreview();
        _videoState = "off";
        setVideoState("off");
        return Promise.resolve(false);
    }, [openButtonPressed, updateInputState, stopVideoPreview]);

    const initAudioMedia = useCallback(() => {
        if (_audioSelection.current.deviceId) {
            return navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: _audioSelection.current.deviceId,
                }
            }).then((stream) => {
                console.log("audio init succeeded");
                stopAudioFeedback();
                // on iPad, at least, it seems that if you stop the audio you won't get it back
                const isIPad = navigator.userAgent.match(/\biPad\b/);
                if (openButtonPressed && !isIPad) {
                    stream.getTracks().forEach(t => t.stop());
                }
                setupAudioFeedback(stream);
                _micState = "on";
                setMicState(_micState);
                return true;
            }).catch((err) => {
                console.log("audio init failed: " + err.name);
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
            });
        }
        stopAudioFeedback();
        _micState = "off";
        setMicState("off");
        return Promise.resolve(false);
    }, [openButtonPressed, updateInputState, setupAudioFeedback, stopAudioFeedback]);

    const initMedia = useCallback((types) => {
        if (openButtonPressed) return Promise.resolve(false);
        if (!videoChat) return Promise.resolve(false);

        return enumerateDevices().then(() => {
            const promises = [];
            if (types.video) promises.push(initVideoMedia());
            if (types.audio) promises.push(initAudioMedia());
            return Promise.all(promises).then(() => true);
        });
    }, [enumerateDevices, initAudioMedia, initVideoMedia, openButtonPressed, videoChat]);

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
    }, []);

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
        if (props.boardOpenPageShown) {
            enumerateDevices().then((info) => {
                _audioDeviceList = info.audio;
                setAudioDeviceList(info.audio);
                _videoDeviceList = info.video;
                setVideoDeviceList(info.video);
            });
        }
    }, [props.boardOpenPageShown, enumerateDevices]);

    const stopVideoPreview = useCallback(() => {
        let videoPreview = videoPreviewRef.current;
        console.log(`stopVideoPreview (preview ${videoPreview ? "" : "not "}found)`);
        if (!videoPreview) {return;}
        if (videoPreview.srcObject) {
            videoPreview.srcObject.getTracks().forEach(t => t.stop());
        }
        videoPreview.srcObject = null;
        videoPreview.onloadedmetadata = null;
        videoPreview.pause();
    }, []);

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
        ? <GuestUserName guestName={guestName} onChange={guestNameChange} nameRef={guestNameRef} />
        : null;

    let display = props.boardOpenPageShown ? "flex" : "none";

    let videoDisplay = videoChat ? {} : {display: "none"};

    // <WalletName name={walletName} walletNameEdited={walletNameEdited}/>

    return (
        <div className="board-page-background" style={{display}}>
            <div className="board-page container shadow p-2">
                <div className="row">
                    <div className="col-12">
                        <div>
                            <div className="board-header-collapse"></div>
                            <CloseSettingsPageButton handleCloseSettings={handleCloseBoardPage} />
                        </div>
                    </div>
                </div>
                <div className="row">
                    <div className="board-page-header col-12">
                        <div className="board-header-collapse text-center"></div>
                        <BoardName name={boardName} />
                        <div className="board-header-collapse"></div>
                    </div>
                </div>
                <div style={videoDisplay} className="row justify-content-center">
                    <div className="col-6">
                        <SettingsMenu1 handler={handleAudioChanged} deviceList={audioDeviceList} type={"audio"} selected={audioSelection.current.deviceId || audioSelection.prev.deviceId}/>
                    </div>
                </div>
                <div style={videoDisplay} className="row justify-content-center">
                    <div className="col-6">
                        <SettingsMenu1 handler={handleVideoChanged} deviceList={videoDeviceList} type={"video"} selected={videoSelection.current.deviceId || videoSelection.prev.deviceId}/>
                    </div>
                </div>

                <div className="row justify-content-center mt-4 py-3 mx-2 bg-light">
                    <div className="col-2 pt-4 mt-3"></div>
                    <div className="col-7">
                        <VideoPreview nocamera={videoState !== "on"} videoPreviewRef={videoPreviewRef} />
                    </div>
                    <div className="col-2 pt-4 mt-3">
                        <MediaButton position="top" state={micState} handleClick={videoChat ? handleMicButton : null} type="microphone" />
                        <MediaButton position="bottom" state={videoState} handleClick={videoChat ? handleVideoButton : null} type="video" />
                    </div>
                </div>
                <div className=" row justify-content-center">
                    <div className="audio-preview-holder col-2 mr-5">
                        <AudioPreview audioPreviewRef={audioPreviewRef} />
                    </div>
                </div>
                <div className="guest-name row justify-content-center">
                    {maybeNameField}
                </div>
                <div className="row justify-content-center mt-4">
                    <div className="col-6 text-center">
                        <MediaErrorMessage videoError={showVideoErrorMessage} audioError={showAudioErrorMessage} />
                        <OpenBoardButton handleOpenBoard={handleOpenBoard} id={boardId} disabled={guestName === ""}/>
                    </div>
                </div>
            </div>
        </div>
    );
}

const userPage = document.getElementById('user-page');
ReactDOM.render(<UserPage />, userPage);
