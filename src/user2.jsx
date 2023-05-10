import React, {useEffect, useCallback} from "react";
import ReactDOM from "react-dom";
import {Dropdown} from "react-bootstrap";
import {Database} from "./firebase-loader";
import {Rooms, BoardPage, UserName, UserPhoto, SignOutButton, FeedbackPageButton, WaitFeedback, SortHeader, useState, cachedGetUser} from "./components2.jsx";

import {FeedbackPage} from "./feedback.jsx";

let initialURL = new URL(window.location.href);
let currentURL = window.location.href;
let duplicator;

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
    let maybeSession = searchParams.get("r");
    let boardPromise;

    if (maybeSession) {
        boardPromise = Database.getBoardInfo(maybeSession).then((boardInfo) => {
            return boardInfo;
        }).catch((_error) => {
            return null;
        });
    } else {
        boardPromise = Promise.resolve(null);
    }
    return Promise.all([boardPromise]).then(([board]) => {
        if (board) {
            return {action: "goto", board};
        }
        return null;
    }).catch((_error) => {
        return null;
    });
}

function UserPage(_props) {
    const [user, setUser] = useState(undefined, "user"); // starts with undefined, and may become null
    const [userBoards, setUserBoards] = useState(null, "userBoards"); // connected to the user's userBoards data
    //const [userBoardsList, setUserBoardsList] = useState([], "userBoardsList");

    //const [teamBoardsList, setTeamBoardsList] = useState([], "teamBoardsList");
    const [userBoardsList, setUserBoardsList] = useState([], "userBoardsList");
    const [allBoardsList, setAllBoardsList] = useState([], "userBoardsList");

    const [currentTeam, setCurrentTeam] = useState(null, "currentTeam"); // teamId or null

    // {id: {boards: {id: true}, ownerIds: {id: true}, userIds: {id: true}, lastActivityTime: timestamp}
    const [currentTeamInfo, setCurrentTeamInfo] = useState(null, "currentTeamInfo");
    const [teamWritable, setTeamWritable] = useState(false, "teamWritable");

    // null or boardId
    const [currentBoard, setCurrentBoard] = useState(null, "currentBoard");

    const [currentBoardInfo, setCurrentBoardInfo] = useState(null, "currentBoardInfo");
    const [boardWritable, setBoardWritable] = useState(false, "boardWritable");

    const [boardSettingsPageShown, setBoardSettingsPageShown] = useState(false, "boardSettingsPageShown");

    const [boardPageActiveTab, setBoardPageActiveTab] = useState("RoomEnter", "boardPageActiveTab");

    const [feedbackPageShown, setFeedbackPageShown] = useState(false, "feedbackPageShown");

    const [deferred, setDeferred] = useState(false, "deferred");

    const [boardWatcherQueue, setBoardWatcherQueue] = useState([], "boardWatcherQueue");

    const [teamWatcherTrigger, setTeamWatcherTrigger] = useState(null, "teamWatcherTrigger");

    // null | {teamWatcher: id|null, userBoardsWatcher: id|null, response: id|null}
    // requested -> (responseReceived(id), teamWatcher(id), userBoardsWatcher) -> selectBoard(id);

    const [newBoardRequestState, setNewBoardRequestState] = useState(null, "newBoardRequestState");
    // null | {containerWatcher: id|null, booardWatcher: id|null, response: id|null}

    const [userChangeRequestState, setUserChangeRequestState] = useState(null, "userChangeRequestState");

    const [waitFeedbackTriggerTime, setWaitFeedbackTriggerTime] = useState(-1);
    const [waitFeedbackDuration, setWaitFeedbackDuration] = useState(3500);

    const [sortType, setSortType] = useState("lastVisited", "sortType");
    const [sortOrder, setSortOrder] = useState("descent", "sortOrder");

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
                selectBoard(message.data.id, true);
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
            setUser({name: "Guest User"});
        });
    }, []);

    useEffect(() => {
        if (!user || !user.uid) {return;}
        Database.getUserBoards((userBoardsInfo) => {
            //console.log("userboardsInfo read");
            setUserBoards(userBoardsInfo);
            return userBoardsInfo;
        }).then(() => {
            Database.getTeamInfo(user.uid, teamWatcher, teamError).catch((_e) => null);
        });
    }, [user, teamWatcher, teamError]);

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
                    selectBoard(info.board.id);
                }
                return true;
            }
            return false;
        }).then((withURL) => {
            if (!withURL) {
                selectBoard(null);
                if (user && user.uid) {
                    selectTeam(user.uid);
                } else if (user && !user.uid) {
                    // a guest user: if no URL parameter is specified, redirect to the login page
                    throw new Error("not logged in");
                }
            }
        }).catch((error) => {
            console.log("not signed in, or an error", error);
            goToLoginPage();
        });
    }, [user, selectBoard, selectTeam]);

    useEffect(() => {
        if (currentBoardInfo) {
            if (boardSettingsPageShown) {
                let marker;
                if (boardSettingsPageShown) {
                    marker = "1";
                }
                setURL(null, currentBoardInfo.id, marker);
                return;
            }
        }
        setURL(null, null, false);
    }, [currentBoardInfo, boardSettingsPageShown]);

    useEffect(() => {
        // console.log("currentTeamInfo -> boardsList");
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

    const selectBoard = useCallback((id, isNew) => {
        setCurrentBoard(id);
        setDeferred(!!(id && isNew));
        if (id) {
            Database.getBoardInfo(id, boardWatcher, boardError).then((boardInfo) => {
                setCurrentBoardInfo(boardInfo);
                if (isNew) {
                    setBoardPageActiveTab("RoomSettings");
                }
                setBoardSettingsPageShown(true);
            });
        } else {
            setCurrentBoardInfo(null);
            setBoardSettingsPageShown(false);
        }
    }, [boardWatcher, boardError]);

    useEffect(() => {
        // console.log("userBoards -> boardsList");
        if (userBoards) {
            userBoardsListFromUserBoards(userBoards);
        }
    }, [userBoards, userBoardsListFromUserBoards]);

    useEffect(() => {
        setBoardWatcherQueue((prev) => {
            if (prev.length === 0) {return prev;}
            let queue = [...prev];
            queue.forEach((boardInfo) => {
                updateBoardInfoInLists(boardInfo);
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

    }, [currentBoard, boardWatcherQueue, userBoards, currentTeamInfo, updateBoardInfoInLists, updateNewBoardState, updateUserChangeRequestState]);

    useEffect(() => {
        if (teamWatcherTrigger) {
            let teamDoc = teamWatcherTrigger;
            setTeamWatcherTrigger(null);

            if (newBoardRequestState && newBoardRequestState.response) {
                if (teamDoc.boards[newBoardRequestState.response]) {
                    updateNewBoardState("containerWatcher", newBoardRequestState.response);
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
    }, [teamWatcherTrigger, currentTeamInfo, newBoardRequestState, updateNewBoardState, updateUserChangeRequestState, userChangeRequestState]);

    const handleSortChange = useCallback((type) => {
        if (type === sortType) {
            setSortOrder((old) => {
                return old[0] === "a" ? "descent" : "ascent";
            }
            );
            return;
        }

        setSortType(type);
    }, [sortType]);

    const boardSorter = useCallback((type, order) => {
        let arithComparator = (a, b) => {
            return a - b;
        };

        let strComparator = (a, b) => {
            return a.toLowerCase().localeCompare(b.toLowerCase());
        };

        let time = (c) => c.lastActivityTime ? c.lastActivityTime.toMillis() : 0;

        let occupantsSorterA = (a, b) => {
            return arithComparator(Object.keys(b.board.activeViewIds).length, Object.keys(a.board.activeViewIds).length);
        };
        let occupantsSorterD = (a, b) => {
            return arithComparator(Object.keys(a.board.activeViewIds).length, Object.keys(b.board.activeViewIds).length);
        };

        let visitedSorterA = (a, b) => {
            return arithComparator(time(a.board), time(b.board));
        };

        let visitedSorterD = (a, b) => {
            return arithComparator(time(b.board), time(a.board));
        };

        let ownerSorterA = (a, b) => {
            return -(strComparator(a.ownerName, b.ownerName));
        };

        let ownerSorterD = (a, b) => {
            return strComparator(a.ownerName, b.ownerName);
        };

        let nameSorterA = (a, b) => {
            return -(strComparator(a.board.name, b.board.name));
        };

        let nameSorterD = (a, b) => {
            return strComparator(a.board.name, b.board.name);
        };

        let sorters = {
            "active": {"true": occupantsSorterA, "false": occupantsSorterD},
            "lastVisited": {"true": visitedSorterA, "false": visitedSorterD},
            "owner": {"true": ownerSorterA, "false": ownerSorterD},
            "name": {"true": nameSorterA, "false": nameSorterD}
        };

        let sorter = sorters[type][order[0] === "a"];

        return sorter || occupantsSorterD;
    }, []);

    const mergeList = useCallback((teamList, userList) => {
        let haves = {};
        let result = [];
        teamList.forEach((b) => {
            if (!haves[b.board.id]) {
                haves[b.board.id] = true;
                result.push(b);
            }
        });

        userList.forEach((b) => {
            if (!haves[b.board.id]) {
                haves[b.board.id] = true;
                result.push(b);
            }
        });

        result.sort(boardSorter(sortType, sortOrder));
        return result;
    }, [sortType, sortOrder, boardSorter]);

    const teamBoardsListFromCurrentTeam = useCallback((_teamInfo) => {
        /*
        // console.log(teamInfo);
        let boards;
        if (teamInfo) {
            let promises = [];
            for (let k in teamInfo.boards) {
                promises.push(Database.getBoardInfo(k, boardWatcher, boardError));
            }
            Promise.all(promises).then((array) => {
                boards = array;
                let uPromises = [];
                for (let i = 0; i < array.length; i++) {
                    uPromises.push(cachedGetUser(array[i].ownerId));
                }
                return Promise.all(uPromises);
            }).then((users) => {
                let result = [];

                if (users.length !== boards.length) {throw new Error("lengths don't match");}

                for (let i = 0; i < users.length; i++) {
                    result.push({type: "team", ownerName: users[i].name, board: boards[i]});
                }
                setTeamBoardsList(result);
            });
        } else {
            setTeamBoardsList([]);
        }*/
    }, []);

    const userBoardsListFromUserBoards = useCallback((boardsInfo) => {
        // console.log(boardsInfo);
        let boards;
        if (boardsInfo) {
            let promises = [];
            for (let k in boardsInfo.boards) {
                promises.push(Database.getBoardInfo(k, boardWatcher, boardError));
            }
            Promise.all(promises).then((array) => {
                boards = array;
                let uPromises = [];
                for (let i = 0; i < array.length; i++) {
                    let entry = array[i];
                    if (entry) {
                        uPromises.push(cachedGetUser(entry.ownerId));
                    } else {
                        uPromises.push(Promise.resolve(null));
                    }
                }
                return Promise.all(uPromises);
            }).then((users) => {
                let result = [];
                if (users.length !== boards.length) {throw new Error("lengths don't match");}
                for (let i = 0; i < users.length; i++) {
                    if (!users[i]) {continue;}
                    result.push({type: "user", ownerName: users[i].name, board: boards[i]});
                }
                setUserBoardsList(result);
            });
        } else {
            setUserBoardsList([]);
        }
    }, [boardWatcher, boardError]);

    useEffect(() => {
        setAllBoardsList(mergeList([], userBoardsList));
    }, [userBoardsList, mergeList, sortType, sortOrder]);

    const boardWatcher = useCallback((boardInfo) => {
        setBoardWatcherQueue((prev) => {
            let newQueue = [...prev];
            newQueue.push(boardInfo);
            return newQueue;
        });
    }, []);

    const newBoard = useCallback(() => {
        // so currentTeam should be always the default team for now
        let name = "Untitled";
        let teamId = currentTeam || (user && user.uid) || null;
        setWaitFeedbackDuration(0); // default
        setWaitFeedbackTriggerTime(Date.now());
        Database.addBoard(name, teamId, boardWatcher).then((board) => {
            console.log(`room ${board.data.id} added`);
            updateNewBoardState("response", board.data.id);
        }).catch((error) => {
            console.log("room creation failed", error);
        });
    }, [boardWatcher, currentTeam, user, updateNewBoardState]);

    const updateCurrentBoard = useCallback((newValue) => {
        if (!newValue) {
            setCurrentBoard(null);
        } else {
            Database.updateBoardInfo(currentBoard, newValue);
            let newInfo = {...currentBoardInfo, ...newValue};
            setCurrentBoardInfo(newInfo);
        }
    }, [currentBoard, currentBoardInfo]);

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
        if (!currentBoard) {return Promise.resolve(false);}
        let boardId = currentBoard;
        selectBoard(null);
        setBoardPageActiveTab("RoomEnter");
        setBoardSettingsPageShown(false);
        setWaitFeedbackDuration(0); // default
        setWaitFeedbackTriggerTime(Date.now());
        return Database.deleteBoard({boardId}).then((data) => {
            let responseId = data.data.id;
            console.log("deleteBoard", responseId);
        }).catch((error) => {
            console.log("deleteBoard failed", error);
        });
    }, [currentBoard, selectBoard]);

    const handleCloseFeedback = useCallback(() => {
        setFeedbackPageShown(false);
    }, []);

    const updateNewBoardState = useCallback((newKey, id) => {
        if (newKey === "response") {
            setNewBoardRequestState({response: id});
            return;
        }

        const kickBoardHighlight = () => {
            let categoryRef = {current: null}; // teamBoardsCategoryRef;
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
                selectBoard(id, true);
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

    const updateBoardInfoInLists = useCallback((boardInfo) => {
        if (!user) {return;}

        cachedGetUser(boardInfo.ownerId).then((owner) => {
            if (!owner) {return;}
            let ownerName = owner.name;
            setUserBoardsList((prev) => {
                let array = [...prev];
                let index = array.findIndex(b => b.board.id === boardInfo.id);
                if (index < 0) {
                    array.push({type: "user", ownerName: ownerName, board: boardInfo});
                } else {
                    array[index] = {type: "user", ownerName: ownerName, board: boardInfo};
                }
                return array;
            });
        });
    }, [user]);

    const teamWatcher = useCallback((teamDoc) => {
        //console.log("team watcher: ", teamDoc);
        setTeamWatcherTrigger(teamDoc);
    }, []);

    const teamError = useCallback((_id) => {
        console.log("team error occured");
        selectBoard(null);
        selectTeam(null);
        setWaitFeedbackTriggerTime(-1);
        // perhaps show oops page here
    }, [selectTeam, selectBoard]);

    const boardError = useCallback((id) => {
        console.log("board error occured");
        setBoardSettingsPageShown(false);
        selectBoard(null);
        setWaitFeedbackTriggerTime(-1);

        setCurrentTeamInfo((old) => {
            let newInfo = {...old};
            newInfo.boards = {...newInfo.boards};
            delete newInfo.boards[id];
            return newInfo;
        });
    }, [selectBoard]);

    const selectTeam = useCallback((teamId) => {
        if (!teamId) {
            if (!user || !user.uid) {
                setCurrentTeam(null);
                setCurrentTeamInfo(oldInfo => {
                    forgetAllTeamBoards(oldInfo);
                    return null;
                });
                teamBoardsListFromCurrentTeam(null);
                return;
            }
            teamId = user.uid;
        }
        Database.getTeamInfo(teamId, teamWatcher).then((teamInfo) => {
            setCurrentTeam(teamId);
            setCurrentTeamInfo(oldInfo => {
                forgetAllTeamBoards(oldInfo);
                return teamInfo;
            });
        });
    }, [teamBoardsListFromCurrentTeam, teamWatcher, user]);

    let rooms = allBoardsList.map(obj => {
        let board = obj.board;
        let time = board.lastActivityTime ? board.lastActivityTime.toMillis() : 0;
        return {
            name: board.name,
            lastVisited: new Date(time),
            ownerId: board.ownerId,
            boardId: board.id,
            activeViewIds: board.activeViewIds
        };
    });

    let maybeBoardPage = boardSettingsPageShown && currentBoardInfo
        ? (
            <BoardPage
                handleDelete={handleDelete}
                handleDuplicate={handleDuplicate}
                boardSettingsPageShown={boardSettingsPageShown}
                setBoardSettingsPageShown={setBoardSettingsPageShown}
                currentBoardInfo={currentBoardInfo}
                currentBoard={currentBoard}
                updateCurrentBoard={updateCurrentBoard}
                user={user}
                boardWritable={boardWritable}
                teamWritable={teamWritable}
                deferred={deferred}
                activeTab={boardPageActiveTab}
                setActiveTab={setBoardPageActiveTab}/>
        ) : null;

    let maybeFeedbackPage = feedbackPageShown
        ? (
            <FeedbackPage handleCloseFeedback={handleCloseFeedback}/>
        ) : null;

    let guestStyle = user && user.uid ? {} : {visibility: "hidden"};

    let feedbackClick = useCallback(() => {
        setFeedbackPageShown(!feedbackPageShown);
    }, [feedbackPageShown]);

    return (
        <div className="user-page-top">
            <div className="user-page-top-bar no-select">
                <div className="user-page-top-bar-logo"/>
                <div className="user-page-top-bar-right" style={guestStyle}>
                    <UserName userName={user ? user.email : "(guest)"} />
                    <Dropdown className="user-photo-container">
                        <Dropdown.Toggle id="dropdown-basic" className="user-photo-button">
                            <UserPhoto url={user ? user.photoURL : null} initials={user ? user.initials : ""} />
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Item onClick={handleSignOut}>
                                <SignOutButton user={user} />
                            </Dropdown.Item>
                            <Dropdown.Item onClick={feedbackClick}>
                                <FeedbackPageButton/>
                            </Dropdown.Item>
                            <Dropdown.Divider/>
                            <Dropdown.Header>
                                <div className="">
                                    <span>{user ? user.name : "Guest"}</span>
                                </div>
                            </Dropdown.Header>
                        </Dropdown.Menu>
                    </Dropdown>
                </div>
            </div>
            <div className="user-page-main no-select">
                <div className="user-page-list-container no-select">
                    <div className="user-page-list-button-row no-select">
                        <button onClick={newBoard} className="btn btn-success user-page-list-new-button" style={guestStyle}>
                            <i className="fas fa-plus"/>
                            <span className="user-page-new-button-label">Create New Room</span>
                        </button>
                    </div>
                    <div className="room-row room-row-header">
                        <SortHeader
                            handler={handleSortChange}
                            thisClass="room-row-active-holder"
                            labelClass="room-row-active"
                            sortType={sortType}
                            sortOrder={sortOrder}
                            type="active-swatch"/>
                        <SortHeader
                            handler={handleSortChange}
                            thisClass="room-row-element room-row-name"
                            labelClass="room-row-label room-row-name-label"
                            sortType={sortType}
                            sortOrder={sortOrder}
                            type="name"/>
                        <SortHeader
                            handler={handleSortChange}
                            thisClass="room-row-element room-row-last-visited"
                            labelClass="room-row-label room-row-last-visited-label"
                            sortType={sortType}
                            sortOrder={sortOrder}
                            type="lastVisited"/>
                        <SortHeader
                            handler={handleSortChange}
                            thisClass="room-row-element room-row-owner"
                            labelClass="room-row-label room-row-owner-label"
                            sortType={sortType}
                            sortOrder={sortOrder}
                            type="owner"/>
                        <SortHeader
                            handler={handleSortChange}
                            thisClass="room-row-element room-row-occupants"
                            labelClass="room-row-label room-row-occupants-label"
                            sortType={sortType}
                            sortOrder={sortOrder}
                            type="active"/>
                        <div className="room-row-element room-row-link">
                            <div className="room-row-link-label"></div>
                        </div>
                    </div>
                    <div className="user-page-rooms-holder">
                        <Rooms user={user} selectBoard={selectBoard} rooms={rooms}/>
                    </div>
                </div>
            </div>
            {maybeBoardPage}
            {maybeFeedbackPage}
            <WaitFeedback trigger={waitFeedbackTriggerTime} duration={waitFeedbackDuration}/>
        </div>
    );
}

const userPage = document.getElementById('user-page');
ReactDOM.render(<UserPage />, userPage);
