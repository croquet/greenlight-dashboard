import React, {useRef, useState as nativeUseState, useEffect, useCallback} from "react";
import {Button, Tooltip, OverlayTrigger, Row} from 'react-bootstrap';
import {Database} from "./firebase-loader";

let converterDiv;
let userCache = {};

const defaultUser = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAwCAYAAACFUvPfAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAv5JREFUeNrsWT1MU1EUvn0Wg9ABF4GJYnQ0lk0TNa+Jg3HBnYHH4mawmyYmLQPBrTZuLpYZE9oFHUioaILjC67GdEQXMVaNgOA59b6kLe/+nPvea9/wvuSk/Fzu/e53z7nn3ANjCRIkGDhSUUz67e4tu+Pb/fMb226sSAPBLHzcA5sFy4GNCYY2wZB8HawBG2n2nTSQdeBjkRM1QQ2sAuQbkZPmR/8SLBvSaSPpAsWFUgSyeOxFsIcRxdcSEC+FRpoT3grgChSXWQDy+4FI95GwB3STvIy4FTPCjK+1LhtgKSZY7zNhDzYIVia7B/wRBlzZZMUzFy+x1Gim/fXx1z12/GXPlHze70pMSxJGkbpC+kqOjRQeM2t8ouvnRx9d9vvFc/b38yfqlHi1Tuu6R1GS2XwxdP0GyzytnCLsbQZ/hydARBYELClJc5UdUoYCV0CFVWNGnyybuMi8jtIOdVZU2fNhadTDKeBYA7UdFel56qzW+CQhSC+bqD0rJM1dg1xTWBcmIr8CZUrbJjPitaaLk9YPkyXGQNCciLRR5Xa4805/7If3pmpnRaSnTGbD+/dwR03mT/1VkEQTrtKIX+WVdhIR4WDzTTvBhIF0WJFy8rPFWo8W2dnbd9jQtZssleFpHJQ92Hwt3dDASHe6Sq8L4IbCRNqnliXfIJ66ssSBxI92XfDrtcCq95L+Tq3mMDX71Rt+aRw3hYakMQaIQemKArFBISwqkHSqwcxKRSv197QgfElrn9u5+w+oi56qQ4bnFnSHdzV8ukjzd5mrsyCqFRQYC4QHr7RgWu1XrUE4qbqKdBWPg8UHTfAAudLcRSoxIr2k+9x6FhO1XRCxSnmNO/xhOUjM+PX4hH0PvsPqIN1C1JRUNWsKlLs7RFRlzcg49vKQsDTrqJT2bpM8JcVHSVhL6R7VSyadJ500zf63eGtaSYk6O39glk0fwYJkVlD1pAOR7iBv8x6JY6hsjd8QTXL6DyoTD1T879ZVHqy2gKTL7a2uGyRIYIB/AgwAEdL8NfOBdYgAAAAASUVORK5CYII=";

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

function cachedGetUser(uid, viewId, guestName) {
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

export function BoardSettingsPage(props) {
    let [activeTab, setActiveTab] = useState("RoomSettings"); // "InvitedUsers", "RoomSettings"
    let currentBoardInfo = props.currentBoardInfo;

    if (!props.boardSettingsPageShown) {
        if (activeTab !== "RoomSettings") {
            setActiveTab("RoomSettings");
        }
        return (
            <div style={{display: "none"}}>No settings</div>
        );
    }

    let isPrivate = currentBoardInfo.access === "private";
    // let isTeam = currentBoardInfo.access === "team";
    let teamWritable = props.teamWritable;
    let boardWritable = isPrivate && props.writable;
    let writable = boardWritable || teamWritable;

    const tabs = [];
    tabs.push({
        label: "General",
        value: "RoomSettings",
        Pane: BoardBasicSettingsPane
    });
    tabs.push({
        label: "Chat",
        value: "VideoConference",
        Pane: BoardVideoSettingsPane
    });
    // BoardVideoSettingsPane},
    //if (!isPrivate) {
    //tabs.push({ label: "Invited Users", value: "InvitedUsers", Pane: BoardInvitedUsersSettingsPane });
    //}
    // {label: "Properties", value: "Properties", Pane:
    // BoardPropertiesSettingsPane},
    tabs.push({
        label: "Advanced",
        value: "Advanced",
        Pane: BoardAdvancedSettingsPane
    });

    const handleCloseBoardPage = () => {
        props.updateCurrentBoard(null);
        props.setBoardOpenPageShown(false);
        props.setBoardSettingsPageShown(false);
        setActiveTab("RoomSettings");
    };

    let panes = tabs.map((info) => {
        let display = info.value === activeTab ? "inherit" : "none";

        return <info.Pane
            handleDelete={props.handleDelete}
            handleDuplicate={props.handleDuplicate}
            key={info.value}
            value={info.value}
            writable={writable}
            user={props.user}
            currentBoard={props.currentBoard}
            currentBoardInfo={props.currentBoardInfo}
            updateCurrentBoard={props.updateCurrentBoard}
            activeTab={activeTab}
            display={display}
            addOwnerToBoard={props.addOwnerToBoard}
            addUserToBoard={props.addUserToBoard}
            removeOwnerFromBoard={props.removeOwnerFromBoard}
            removeUserFromBoard={props.removeUserFromBoard} />;
    });

    let tabLabel = props.currentBoardInfo ? props.currentBoardInfo.name : "";

    return (
        <div className="board-page-background">
            <Row>
                <div className="board-settings shadow">
                    <div className="board-settings-main row">
                        <div className="col-4">
                            <BoardSettingsTabs
                                tabs={tabs}
                                setActiveTab={setActiveTab}
                                activeTab={activeTab}
                                tabLabel={tabLabel} />
                        </div>
                        <div className="col-8">
                            <div className="board-settings-basic-pane pr-1 my-2 mr-2">
                                <CloseSettingsPageButton handleCloseSettings={handleCloseBoardPage} />
                                <h6 className="roomSettings text-uppercase pt-3 pl-4 no-select">room settings</h6>
                                {panes}
                            </div>
                        </div>
                    </div>
                </div>
            </Row>
        </div >
    );
}

export function BoardSettingsTabs(props) {
    const handleClick = (value) => {
        props.setActiveTab(value);
    };
    let tabs = props.tabs;

    let tabLabels = tabs.map((info) => <BoardSettingsTabLabel
        setActiveTab={props.setActiveTab}
        activeTab={props.activeTab}
        handleClick={handleClick}
        key={info.label}
        label={info.label}
        value={info.value} />);

    return (
        <div className="board-settings-tabs">
            <div className="board-settings-title text-uppercase text-center">{props.tabLabel}</div>
            {tabLabels}
        </div>
    );
}

export function BoardBasicSettingsPane(props) {
    let {currentBoardInfo, writable, updateCurrentBoard} = props;

    let handleNameAccept = (name) => {
        updateCurrentBoard({name});
    };

    let selectAccessLevelHandler = (level) => {
        if (level === "public" || level === "team" || level === "private") {
            updateCurrentBoard({access: level});
        }
    };

    let creatorRef = useRef(null);
    let nameRef = useRef(null);

    const accessLevelLabel = "Access Level";

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

    return (
        <div style={{display: props.display}}>
            <div className="board-settings-basic-pane pl-4">
                <TextSetting
                    onAccept={handleNameAccept}
                    writable={writable}
                    addButtonColumn={true}
                    originalContent={currentBoardInfo.name}
                    displayLabel="Name"
                    nameRef={nameRef} />
                <TextSetting
                    writable={false}
                    addButtonColumn={true}
                    displayLabel="Creator"
                    nameRef={creatorRef} />
                <div className="access-level-menu-holder">
                    <div className="board-page-settings-label no-select">
                        {accessLevelLabel}
                    </div>
                    <AccessLevelMenu
                        selectAccessLevelHandler={selectAccessLevelHandler}
                        writable={writable}
                        current={currentBoardInfo.access} />
                </div>
            </div>
        </div>
    );
}

export function BoardVideoSettingsPane(props) {
    let {currentBoardInfo, writable, updateCurrentBoard} = props;

    let selectChatFeatureHandler = (level) => {
        let thereIs = ["default", "textOnly", "videoOnly", "noChat"].indexOf(level);
        if (thereIs >= 0) {
            updateCurrentBoard({chat: level});
        }
    };

    let chat = currentBoardInfo.chat || "default";

    const chatFeatureLabel = "Chat Feature";

    return (
        <div style={{display: props.display}}>
            <div className="board-settings-basic-pane pl-4">
                <div className="chat-feature-menu-holder">
                    <div className="board-page-settings-label no-select">
                        {chatFeatureLabel}
                    </div>
                    <ChatFeatureMenu
                        selectChatFeatureHandler={selectChatFeatureHandler}
                        writable={writable}
                        current={chat}/>
                </div>
            </div>
        </div>
    );
}

function UserList(props) {
    let [_names, setNames] = useState(null);
    let [userEntries, setUserEntries] = useState([]); // sorted users
    let {addUser, addOwner, removeUser, removeOwner, writable, currentInfo, user, display} = props;

    let newUserRef = useRef(null);
    const onKeyDown = (evt) => {
        if (!newUserRef.current) {
            return;
        }
        if (evt.key === "Enter") {
            evt.preventDefault();
            evt.stopPropagation();
            let email = newUserRef.current.textContent.trim();
            doAddUser(email);
        }
    };

    const onKeyUp = (evt) => {
        if (!newUserRef.current || evt.key === "Enter") {
            setNames(null);
            return;
        }
        evt.stopPropagation();
        let prefix = newUserRef.current.textContent.trim();
        Database.emailsStartsWith(prefix).then((list) => {
            setNames(list);
        });
    };

    const nameFieldClick = () => {
        if (newUserRef.current) {
            let email = newUserRef.current.textContent.trim();
            if (email === "user@email.com") {
                newUserRef.current.textContent = "";
            }
        }
    };

    const onPaste = useCallback((evt) => {
        evt.preventDefault();
        let text = evt.clipboardData.getData("text/plain");
        if (newUserRef.current) {
            newUserRef.current.textContent += text;
        }
    }, []);

    /*
    const namesSelect = (email) => {
        if (newUserRef.current) {
            newUserRef.current.textContent = email;
            newUserRef.current.focus();
        }
        setNames(null);
    };
    */

    let clickAddUser = () => {
        if (newUserRef.current) {
            let email = newUserRef.current.textContent.trim();
            doAddUser(email);
        }
    };

    let doAddUser = (email) => {
        if (email.length === 0) {return;}
        Database.lookupUserFromEmail(email).then((u) => {
            if (!u) {
                return;
            }
            addUser(u.uid);
            setNames(null);
        }).catch((error) => {
            console.log("email not found", error);
        });
    };

    useEffect(() => {
        let uids = [];
        if (currentInfo) {
            uids = [
                ...Object.keys(currentInfo.ownerIds),
                ...Object.keys(currentInfo.userIds)
            ];
        }

        let promises = uids.map(cachedGetUser);

        Promise.all(promises).then((us) => {
            let me = us.filter((u) => u && u.uid === user.uid);
            let others = us.filter((u) => u && u.uid !== user.uid);
            others.sort((a, b) => {
                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;
                return 0;
            });

            setUserEntries([...me, ...others]);
        });
    }, [currentInfo, user.uid]);

    let list = userEntries.map((u) => {
        return (
            <BoardUserLabel
                user={user}     // details of this user
                member={u}      // details of user to be displayed
                key={u.uid}
                writable={writable} // can this user make changes?
                currentInfo={currentInfo}
                removeUser={removeUser}
                addOwner={addOwner}
                removeOwner={removeOwner} />
        );
    });

    useEffect(() => {
        newUserRef.current.textContent = "user@email.com";
    }, []);

    return (
        <div className="board-invited-users mx-2" style={{display}}>
            <div className="board-invited-user-list">
                {list}
            </div>
            <div className="board-invited-user-total mt-2">{`total users: ${userEntries.length}`}</div>
            <div
                style={{display: writable ? "flex" : "none"}}
                className="row justify-content-between">
                <div className="col-8">
                    <div
                        ref={newUserRef}
                        className="board-invited-user-new-user-text"
                        contentEditable={writable}
                        onKeyDown={onKeyDown}
                        onKeyUp={onKeyUp}
                        onPaste={onPaste}
                        onClick={nameFieldClick}></div>
                </div>
                <div className="col-4">
                    <div className="btn-sm btn-success">
                        <div className="board-invited-user-add-user-label text-center" onClick={clickAddUser}>ADD USER</div>
                    </div>
                </div>
            </div>
            {/*<NamesDropDown
                selectItem={namesSelect}
                items={names}
                   placeholderRef={newUserRef} />*/}
        </div>
    );
}

export function BoardInvitedUsersSettingsPane(props) {
    return (<UserList
        addUser={props.addUserToBoard}
        addOwner={props.addOwnerToBoard}
        removeOwner={props.removeOwnerFromBoard}
        removeUser={props.removeUserFromBoard}
        writable={props.writable}
        user={props.user}
        display={props.display}
        currentInfo={props.currentBoardInfo} />);
}

/*
function BoardPropertiesSettingsPane(props) {
    return (
        <div style={{display: props.display}}>properties</div>
    );
}
*/

function BoardAdvancedSettingsPane(props) {
    let writable = props.writable;
    return (
        <div style={{display: props.display}}>
            <ActionButton
                writable={writable}
                label="Delete Room"
                value="DeleteRoom"
                onClick={props.handleDelete}
                finePrint="" />
            <ActionButton
                writable={writable}
                label="Copy Room"
                value="DuplicateRoom"
                onClick={props.handleDuplicate}
                finePrint="use the room as template and make a copy" />
        </div>
    );
}

function BoardThumbnail(props) {
    let onClick = () => props.selectBoard(props.id);
    let onSettingsClick = (evt) => {
        evt.stopPropagation();
        props.selectSettings(props.id);
    };

    let userMap = props.userMap;
    let [displayUsers,  setDisplayUsers] = useState([]);

    let isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        if (userMap) {
            let promises = userMap.map((obj) => {
                return cachedGetUser(obj.uid, obj.viewId, obj.guestName).then((u) => {
                    if (u) {
                        return [u.uid, u.photoURL, u.name];
                    }
                    return null;
                });
            });

            Promise.all(promises).then((array) => {
                if (!isMounted.current) {return;}
                let nineArray = array.slice(0, 9);
                nineArray = nineArray.filter(a => a);
                const newImg = (triple, i) => {
                    return (
                        <OverlayTrigger
                            key={`${triple[0]}${i}`}
                            placement={"top"}
                            popperConfig={
                                {modifiers: [{name: "offset", options: {offset: [0, 4]}}]}}
                            overlay={(
                                <Tooltip className="user-name-tooltip">
                                    {triple[2]}
                                </Tooltip>)}>
                            <img className="rounded-circle mx-1" width={20} height={20} src={triple[1]} />
                        </OverlayTrigger>
                    );
                };

                let faces = nineArray.map(newImg);
                if (array.length === 10) {
                    faces.push(newImg(array[9]));
                } else if (array.length > 10) {
                    faces.push(
                        <div
                            className="mx-1 roomusers-plus-sign"
                            key={"plus"}>
                            {`+${array.length - 9}`}
                        </div>
                    );
                }
                setDisplayUsers(faces);
            });
        }
        return () => {isMounted.current = false;};
    }, [userMap]);

    return (
        <div onClick={onClick} className="mb-4 board-thumbnail">
            <div className="text-center mx-auto d-block board-thumbnail-room-name no-select">{props.board}</div>
            <div className="board-thumbnail-rect mx-auto d-block shadow-sm">
                <div className="board-thumbnail-extra">
                    <div className="board-thumbnail-settings-button" onClick={onSettingsClick}>
                        <i className="fas fa-cog"></i>
                    </div>
                </div>
                <div>
                    <div className="row justify-content-center mx-auto px-2" data-tip data-for="registerTip">
                        <div className="row">
                            <div className="roomusers px-2 pt-3 mt-4">
                                {displayUsers}
                            </div>
                        </div>
                    </div>
                    <div className="board-thumbnail-extra-dummy"></div>
                </div>
            </div>
        </div>
    );
}

export function Boards(props) {
    // let userBoards = props.userBoardsList; // [boardInfo]
    let teamBoards = props.teamBoardsList; // [boardInfo]
    let userMap = props.userMap;
    let teamWritable = props.teamWritable;

    let teamBoardsCategoryRef = props.teamBoardsCategoryRef;
    // let userBoardsCategoryRef = props.userBoardsCategoryRef;

    let thumbnailFunc = (b) => {
        return <BoardThumbnail
            userMap={userMap[b.id]}
            key={`${b.id}`}
            board={b.name}
            id={b.id}
            selectBoard={props.selectBoard}
            selectSettings={props.selectSettings} />;
    };

    let teamRooms = teamBoards.map(thumbnailFunc);

    /*
    let mine = userBoards.map(thumbnailFunc);

    if (props.user && props.user.uid) {
        let plus = <NewThumbnailButton key={"_new"} newBoard={props.newBoard} userBoard={true} />;
        mine.unshift(plus);
    }
    */

    if (props.team && teamWritable) {
        let teamPlus = <NewThumbnailButton key={"_new"} newBoard={props.newBoard} userBoard={false} />;
        teamRooms.unshift(teamPlus);
    }

    return (
        <div ref={teamBoardsCategoryRef} className="m-4 bg-light roomContainer">
            {teamRooms}
        </div>
    );
}

function NewThumbnailButton(props) {
    let onClick = (_evt) => props.newBoard(props.userBoard);
    return (
        <div onClick={onClick} className="mb-4 p-3 board-thumbnail">
            <Button variant="white" block className="p-2 mx-auto d-block newRoomButton">
                <svg
                    style={{
                        width: "25px",
                        height: "25px",
                        marginLeft: "auto",
                        marginRight: "auto"
                    }}
                    viewBox="0 0 24 24">
                    <use href="#img-add"></use>
                </svg>
                <div
                    className="no-select createRoom p text-center">New Room</div>
            </Button>
        </div>
    );
}

export function TeamSettingsPage(props) {
    let {addUserToTeam, addOwnerToTeam, removeUserFromTeam, removeOwnerFromTeam, currentTeamInfo} = props;

    let [activeTab, setActiveTab] = useState("TeamSettings"); // "TeamSettings", "InvitedUsers", "Advanced"

    if (!props.teamSettingsPageShown) {
        return <div style={{display: "none"}}>No team settings</div>;
    }
    const tabs = [
        {
            label: "General",
            value: "TeamSettings",
            Pane: TeamBasicSettingsPane
        },
        // {label: "Video Conference", value: "VideoConference", Pane:
        // BoardVideoSettingsPane},
        {
            label: "Members",
            value: "InvitedUsers",
            Pane: TeamMemberSettingsPane
        },
        // {label: "Properties", value: "Properties", Pane:
        // BoardPropertiesSettingsPane},
        {
            label: "Advanced",
            value: "Advanced",
            Pane: TeamAdvancedSettingsPane
        }
    ];

    const handleCloseTeamPage = () => {
        props.setTeamSettingsPageShown(false);
        setActiveTab("TeamSettings");
    };

    let panes = tabs.map((info) => {
        let display = info.value === activeTab ? "inherit" : "none";

        return <info.Pane
            handleDelete={props.handleDelete}
            handleDuplicate={props.handleDuplicate}
            key={info.value}
            value={info.value}
            writable={props.teamWritable}
            user={props.user}
            currentTeam={props.currentTeam}
            currentTeamInfo={currentTeamInfo}
            updateCurrentTeam={props.updateCurrentTeam}
            activeTab={activeTab}
            display={display}
            addUserToTeam={addUserToTeam}
            addOwnerToTeam={addOwnerToTeam}
            removeUserFromTeam={removeUserFromTeam}
            removeOwnerFromTeam={removeOwnerFromTeam} />;
    });

    let tabLabel = currentTeamInfo ? currentTeamInfo.name : "";

    return (
        <div className="board-page-background" style={{display: props.teamSettingsPageShown}}>
            <Row>
                <div className="board-settings shadow">
                    <div className="board-settings-main row">
                        <div className="col-4">
                            <BoardSettingsTabs
                                tabs={tabs}
                                setActiveTab={setActiveTab}
                                activeTab={activeTab}
                                tabLabel={tabLabel} />
                        </div>
                        <div className="col-8">
                            <div className="board-settings-basic-pane pr-1 my-2 mr-2">
                                <CloseSettingsPageButton handleCloseSettings={handleCloseTeamPage} />
                                <h6 className="roomSettings text-uppercase pt-3 pl-2">organization settings</h6>
                                {panes}
                            </div>
                        </div>
                    </div>
                </div>
            </Row>
        </div>
    );
}

function TeamBasicSettingsPane(props) {
    let { currentTeamInfo, writable, updateCurrentTeam } = props;

    let handleNameAccept = (name) => {
        updateCurrentTeam({name});
    };

    let creatorRef = useRef(null);
    let nameRef = useRef(null);

    useEffect(() => {
        if (!currentTeamInfo) {return;}
        cachedGetUser(currentTeamInfo.ownerId).then((u) => {
            if (creatorRef.current && u) {
                creatorRef.current.textContent = u.name;
            }
        });
    }, [currentTeamInfo]);

    return (
        <div style={{display: props.display}}>
            <div className="board-settings-basic-pane">
                <TextSetting
                    onAccept={handleNameAccept}
                    writable={writable}
                    addButtonColumn={true}
                    originalContent={currentTeamInfo.name}
                    displayLabel="Name"
                    nameRef={nameRef} />
                <TextSetting
                    writable={false}
                    addButtonColumn={true}
                    displayLabel="Creator"
                    nameRef={creatorRef} />
            </div>
        </div>
    );
}

function TeamMemberSettingsPane(props) {
    return (
        <UserList
            addUser={props.addUserToTeam}
            addOwner={props.addOwnerToTeam}
            removeOwner={props.removeOwnerFromTeam}
            removeUser={props.removeUserFromTeam}
            writable={props.writable}
            user={props.user}
            display={props.display}
            currentInfo={props.currentTeamInfo} />
    );
}

function TeamAdvancedSettingsPane(props) {
    let writable = props.writable && Object.keys(props.currentTeamInfo.boards).length === 0;
    let myTeam = props.currentTeamInfo.id === props.user.uid;
    let finePrint;

    if (myTeam) {
        finePrint = "Your default organization cannot be deleted";
    } else if (!writable) {
        finePrint = "An organization with rooms cannot be deleted.";
    } else {
        finePrint = "";
    }
    return (
        <div
            style={{display: props.display}}>
            <ActionButton
                writable={writable && !myTeam}
                label="Delete Organization"
                value="DeleteTeam"
                onClick={props.handleDelete}
                finePrint={finePrint} />
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
            <div className="user-photo user-photo-initials rounded-circle no-select">
                <span>{props.initials}</span>
            </div>
        );
    }
    return (
        <img
            className="user-photo rounded-circle mx-1 no-select"
            src={props.url}
            onError={handleImageErrored}></img>
    );
}

export function SignOutButton(props) {
    let label = props.user && props.user.uid ? "Sign Out" : "Sign In";
    return (
        <span onClick={props.handleSignOut}>{label}</span>
    );
}

export function BoardName(props) {
    return <span className="board-page-board-name">Enter {props.name}</span>;
}

export function OpenBoardButton(props) {
    let disabled = props.disabled;
    let onClick = disabled ? null : () => props.handleOpenBoard(/*props.id*/);
    let disabledStyle = disabled ? "disabled button-style-disabled" : "";

    return (
        <button className={`btn btn-success ${disabledStyle}`} onClick={onClick}>
            <div className="board-page-open-label">Open</div>
        </button>
    );
}

export function SettingsMenu1(props) {
    let displayLabel;
    let {handler, deviceList, type, selected} = props;
    if (type === "audio") {
        displayLabel = "Audio Source";
    } else {
        displayLabel = "Video Source";
    }

    let list = deviceList.map((device) => {
        let {deviceId, label} = device;
        return <option className="board-page-settings-option" key={deviceId} value={deviceId}>{label}</option>;
    });

    return (
        <div className="listContainer">
            <div className="board-page-settings-label">{displayLabel}</div>
            <select className="btn btn-light dropdown-toggle board-page-settings-select" onChange={handler} value={selected || "(none)"}>{list}</select>
        </div>
    );
}

function BoardUserLabel(props) {
    let nameRef = useRef(null);
    let emailRef = useRef(null);
    let initialsRef = useRef(null);
    let imgRef = useRef(null);
    let [isOwner, setIsOwner] = useState(false);
    let [isLastOwner, setIsLastOwner] = useState(false);
    let [isUser, setIsUser] = useState(false);

    let writable = props.writable;
    let currentInfo = props.currentInfo;

    let member = props.member;
    let uid = member.uid;

    useEffect(() => {
        // if (!user) {return;}
        // because you might have lost access to this board, nameRef may be unmounted
        if (!nameRef.current) {return;}

        nameRef.current.textContent = member.name;
        initialsRef.current.textContent = initialsFrom(member.name);
        emailRef.current.textContent = member.email;
        imgRef.current.src = member.photoURL || defaultUser;
    }, [member]);

    useEffect(() => {
        if (!currentInfo) {return;}
        let userIds = currentInfo.userIds;
        let ownerIds = currentInfo.ownerIds;

        let u = !!(userIds[uid]);
        let o = !!(ownerIds[uid]);

        setIsUser(u);
        setIsOwner(o);
        setIsLastOwner(Object.keys(ownerIds).length === 1);
    }, [currentInfo, uid]);

    const removeUser = () => {
        props.removeUser(uid);
    };

    const addOwner = () => {
        props.addOwner(uid);
    };

    const removeOwner = () => {
        props.removeOwner(uid);
    };

    return (
        <div className="user-label-holder">
            <img
                ref={imgRef}
                className="user-label-info-photo rounded-circle"
                key={uid}
                width={24}
                height={24} />
            <div className="user-label-info-holder">
                <div className="user-label-info">
                    <div ref={nameRef} className="user-label-info-name"></div>
                    <div>&nbsp;-&nbsp;</div>
                    <div ref={initialsRef} className="user-label-info-initials"></div>
                </div>
                <div className="user-label-info-email">
                    <div ref={emailRef}></div>
                </div>
            </div>
            <div className="board-header-collapse"></div>
            <div className="user-label-actions-holder">
                <UserLabelButton
                    writable={writable}
                    uid={member.uid}
                    user={props.user}
                    isUser={isUser}
                    setIsUser={setIsUser}
                    isOwner={isOwner}
                    setIsOwner={setIsOwner}
                    type={"remove"}
                    removeUser={removeUser} />
                <UserLabelButton
                    writable={writable}
                    uid={member.uid}
                    user={props.user}
                    isUser={isUser}
                    setIsUser={setIsUser}
                    isOwner={isOwner}
                    setIsOwner={setIsOwner}
                    addOwner={addOwner}
                    removeOwner={removeOwner}
                    isLastOwner={isLastOwner}
                    type={"owner"} />
            </div>
        </div>
    );
}

function UserLabelButton(props) {
    let cls, label, onClick, visibility;
    let iAmOwner = props.writable;
    let iAmLastOwner = props.isLastOwner;
    let isMe = props.uid === props.user.uid;

    if (props.type === "remove") {
        cls = "user-label-action-remove";
        label = "remove";
        onClick = props.removeUser;
        visibility = iAmOwner && !props.isOwner ? "visible" : "hidden";
    } else if (props.type === "owner") {
        cls = "user-label-action-owner";

        if (iAmOwner && !isMe) {
            label = props.isOwner ? "make non-admin" : "make admin";
            onClick = props.isOwner ? props.removeOwner : props.addOwner;
        } else {
            label = props.isOwner ? "admin" : "member";
        }
        visibility = "visible";
    }
    cls += " no-select";
    if (!iAmOwner || (iAmLastOwner && isMe)) {
        onClick = null;
    }

    cls += onClick ? " hoverable-label" : " non-hoverable-label";

    return <div style={{visibility}} writable={`${iAmOwner}`} className={cls} onClick={onClick}>{label}</div>;
}

export function NewTeamDialog(props) {
    let {closeDialog, openHandler, newTeamDialogShown} = props;
    let nameRef = useRef(null);
    let display = newTeamDialogShown ? "flex" : "none";

    let handleOpen = () => {
        if (nameRef.current) {
            openHandler(nameRef.current.textContent);
        }
    };

    return (
        <div
            className="new-team-dialog-background"
            style={{display}}>
            <div className="new-team-page p-2 shadow">
                <div className="new-team-page-extra">
                    <div className="board-header-collapse"></div>
                    <CloseSettingsPageButton handleCloseSettings={closeDialog} />
                </div>
                <TextSetting
                    writable={true}
                    displayLabel="ENTER NEW ORGANIZATION NAME"
                    baseClassName="new-team-dialog"
                    nameRef={nameRef}
                    originalContent="Unnamed Organization" />
                <OpenButton label="Save" handleOpen={handleOpen} />
            </div>
        </div>
    );
}

/*
export function AnybodyBoardStatus(props) {
    let changed = (evt) => {
        props.changed(evt.target.checked);
    };
    return (
        <div className="board-settings-anybody-holder no-select">
            <input
                className="board-settings-anybody-checkbox mr-3"
                type="checkbox"
                disabled={!props.writable}
                checked={props.checked}
                onChange={changed} />
            <span>
                Anyone can join this room</span>
        </div>
    );
}

*/

export function MediaErrorMessage(props) {
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

export function CloseSettingsPageButton(props) {
    return (
        <Button
            variant="danger" className="float-right closeButton"
            onClick={props.handleCloseSettings}>x</Button>
    );
}

export function CancelSettingsButton(props) {
    return <Button variant="danger" disabled={props.disabled} onClick={props.handleCancelSettings}>Cancel</Button>;
}

export function ApplySettingsButton(props) {
    return <Button variant="success float-right" disabled={props.disabled} onClick={props.handleApplySettings}>Save</Button>;
}

export function VideoPreview(props) {
    let background = props.nocamera ? "board-page-video-preview-background" : "board-page-video-preview-waiting";
    return (<video className={`board-page-video-preview ${background}`} ref={props.videoPreviewRef}/>);
}

export function AudioPreview(props) {
    return (
        <canvas
            className="audio-preview"
            width={100}
            height={30}
            ref={props.audioPreviewRef} />
    );
}

export function MediaButton(props) {
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

export function BoardSettingsTabLabel(props) {
    let label = props.label;
    let activeTab = props.activeTab;
    let handleClick = () => {
        props.handleClick(props.value);
    };

    return (
        <div
            activetab={(activeTab === props.value).toString()}
            className="board-settings-tab-label-holder"
            onClick={handleClick}>
            <div className="board-settings-tab-label no-select">{label}</div>
        </div>
    );
}

export function ActionButton(props) {
    let onClick = props.writable ? props.onClick : null;

    let extraClass = props.writable ? "" : "disabled";
    return (
        <div className="board-advanced-button-holder mx-2 p-4 mt-4 no-select">
            <div
                writable={(!!props.writable).toString()}
                className={`btn btn-danger ${extraClass}`}
                onClick={onClick}>{props.label}</div>
            <div
                writable={(!!props.writable).toString()}
                className="board-action-button-fine-print mt-1">{props.finePrint}</div>
        </div>
    );
}

export function TextSetting(props) {
    let [buttonDisabled, setButtonDisabled] = useState(true); // though there doesn't have to be a button

    const [wasComposing, setWasComposing] = useState(false, "wasComposing");

    const onPaste = useCallback((evt) => {
        evt.preventDefault();
        let text = evt.clipboardData.getData("text/plain");
        console.log(text);

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

    let maybeButton = (addButtonColumn && writable) ? <Button variant="success" className="float-right" disabled={buttonDisabled} onClick={acceptContent}>Apply</Button> : <div />;
    return (
        <div className={holderClassName}>
            <div className={labelClassName}>{displayLabel}</div>
            <div className="row col-12 justify-content-between">
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

function AccessLevelMenu(props) {
    let [isOpen, setIsOpen] = useState(false);
    let {current, writable, selectAccessLevelHandler} = props;

    let items = [
        {name: "public", id: "public"},
        {name: "team", id: "team"},
        // {name: "private", id: "private"}
    ];

    return (<DropDown
        items={items}
        selectItem={selectAccessLevelHandler}
        newItem={null}
        current={{name: current, id: current}}
        writable={writable}
        isOpen={isOpen}
        relativePosition={true}
        notAddNew={true}
        fixedWidth={"100px"}
        setIsOpen={setIsOpen} />);
}

function ChatFeatureMenu(props) {
    let [isOpen, setIsOpen] = useState(false);
    let {current, writable, selectChatFeatureHandler} = props;

    let items = [
        {name: "Default", id: "default"},
        {name: "Text Only", id: "textOnly"},
        {name: "Video Only", id: "videoOnly"},
        {name: "No Chat", id: "noChat"},
    ];

    let entry = (items.find((o) => o.id === current));
    let name = entry ? entry.name : "default";

    return (<DropDown
        items={items}
        selectItem={selectChatFeatureHandler}
        newItem={null}
        current={{name, id: current}}
        writable={writable}
        isOpen={isOpen}
        relativePosition={true}
        notAddNew={true}
        fixedWidth={"150px"}
        setIsOpen={setIsOpen} />);
}

export function TeamsMenu(props) {
    let {current, teamNames, writable, selectTeamHandler, newTeamHandler,
         newTeamDialogShown, setNewTeamDialogShown, teamsMenuIsOpen,
         setTeamsMenuIsOpen} = props;

    return (
        <DropDown
            items={teamNames}
            selectItem={selectTeamHandler}
            newItem={newTeamHandler}
            current={current}
            writable={writable}
            isOpen={teamsMenuIsOpen}
            setIsOpen={setTeamsMenuIsOpen}
            relativePosition={true}
            newTeamDialogShown={newTeamDialogShown}
            setBackgroundIsOpen={setTeamsMenuIsOpen}
            setNewTeamDialogShown={setNewTeamDialogShown}/>
    );
}

export function DropDownItem(props) {
    let {value, label, onClick, current} = props;
    let check = current ? <span style={{fontSize: "14px"}}>&#x2713;</span> : null;

    let newbutton = value === "_new";

    return (
        <div
            newbutton={newbutton.toString()}
            className="drop-down-item py-2 px-4 no-select"
            id={value}
            onClick={onClick}>
            <span>{label}</span>
            {check}
        </div>
    );
}

export function DropDownSingle(props) {
    let {value, label, onClick, writable} = props;
    let cls = "dropdownArrow px-2";

    let extra = writable
        ? <span className={cls}>&#x276F;</span>
        : <span className={cls}>&nbsp;</span>;

    return (
        <div id={value} onClick={onClick}>
            <span>{label}</span>
            {extra}
        </div>
    );
}

export function OpenButton(props) {
    let onClick = () => props.handleOpen();
    return (
        <button className="generic-open-button" onClick={onClick}>
            <div className="generic-open-label">{props.label || "Open"}</div>
        </button>
    );
}

export function DropDown(props) {
    let {current, selectItem, items, isOpen, setIsOpen, notAddNew, writable,
         setNewTeamDialogShown, relativePosition, fixedWidth} = props;

    let placeholderRef = useRef(null);
    let dropdownRef = useRef(null);

    let onItemClick = (evt) => {
        setIsOpen(false);
        selectItem(evt.currentTarget.id);
    };

    let clickSingle;
    if (writable) {
        clickSingle = (evt) => {
            let value = evt.currentTarget.id;
            if (value === "_new") {
                setNewTeamDialogShown(true);
                setIsOpen(false);
            } else {
                setIsOpen(true);
            }
        };
    }

    if (items.length === 0) {
        return <div/>;
    }

    let menuItems = [];

    let value, label;
    if (current) {
        value = current.id;
        label = current.name;
    } else {
        value = "_empty";
        label = "Select Organization";
    }


    let placeholder = <DropDownSingle key={value} value={value} label={label} onClick={clickSingle} writable={writable}/>;

    if (isOpen) {
        items.forEach(({ id, name }) => {
            if (current && current.id === id) {
                menuItems.unshift(<DropDownItem
                    key={current.id}
                    value={current.id}
                    label={current.name}
                    onClick={onItemClick}
                    current={true} />);
            } else {
                menuItems.push(<DropDownItem key={id} value={id} label={name} onClick={onItemClick} />);
            }
        });
        if (!notAddNew) {
            menuItems.push(<DropDownItem key={"_new"} value={"_new"} label={"New Organization"} onClick={clickSingle} />);
        }
    }

    let top = 0;
    let left = 0;
    let minWidth = 100;
    if (placeholderRef.current) {
        let rect = placeholderRef.current.getBoundingClientRect();
        top = relativePosition ? placeholderRef.current.offsetTop : rect.top;
        left = relativePosition ? placeholderRef.current.offsetLeft : rect.left;
        minWidth = rect.width;
    }

    let style = fixedWidth ? {width: fixedWidth} : {};
    let display = isOpen ? "inherit" : "none";

    let extraClass = writable ? "" : "button-style-disabled disabled";

    return (
        <div ref={placeholderRef} className={`btn btn-team ${extraClass}`} style={style}>
            {placeholder}
            <div
                ref={dropdownRef}
                className="drop-down"
                isopen={isOpen.toString()}
                style={{
                    display,
                    top: `${top}px`,
                    left: `${left}px`,
                    minWidth: `${minWidth}px`,
                    maxWidth: "250px",
                    zIndex: "1001"
                }}>
                {menuItems}
            </div>
        </div>
    );
}

export function GuestUserName(props) {
    let {onChange, nameRef} = props;
    return (
        <TextSetting
            onChange={onChange}
            writable={true}
            originalContent={""}
            displayLabel="Guest User Name (required)"
            nameRef={nameRef} />
    );
}

function _NamesDropDown(props) {
    let {selectItem, items, placeholderRef} = props;

    let onItemClick = (evt) => {
        selectItem(evt.currentTarget.textContent);
    };

    let menuItems;

    if (items === null) {
        menuItems = null;
    } else {
        menuItems = items.map(({email, uid}) => {
            return <DropDownItem key={uid} value={uid} label={email} onClick={onItemClick} />;
        });
    }

    let top = 0;
    let left = 0;
    let minWidth = 100;
    if (placeholderRef.current) {
        let rect = placeholderRef.current.getBoundingClientRect();
        top = rect.bottom + 2;
        left = rect.left;
        minWidth = rect.width;
    }

    let display = items !== null ? "inherit" : "none";

    return (
        <div style={{display}} className="drop-down-owner">
            <div
                className="drop-down names-drop-down"
                style={{
                    top: `${top}px`,
                    left: `${left}px`,
                    minWidth: `${minWidth}px`,
                    maxWidth: "250px",
                    zIndex: "100"
                }}>
                {menuItems}
            </div>
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
