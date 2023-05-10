import React, {useState} from "react";

export function FeedbackPage(props) {
    let [pdfShown, setPdfShown] = useState(false);
    let {handleCloseFeedback} = props;

    let dir = window._production || ".";
    let src = dir + "/assets/pdf/croquetgreenlight_howto.pdf";

    let maybePdf = pdfShown
        ? (
            <iframe className="row howto-iframe"
                src={`${src}#view=FitH`}
                width="100%"
                height="80%"/>
        ) : null;

    let helpClick = () => setPdfShown(false);

    let helpClass = pdfShown ? "breadcrumblink" : "font-weight-bold";

    let breadcrumbs = [
        (<a key="dashboard" onClick={handleCloseFeedback} className="breadcrumblink">Dashboard</a>),
        (<span key="dashboard-slash">/</span>),
        (<span key="help-and-feedback" onClick={pdfShown ? helpClick : null} className={`${helpClass}`}>Help & Feedback</span>)
    ];

    if (pdfShown) {
        breadcrumbs.push(
            (<span key="help-slash">/</span>));
        breadcrumbs.push(
            (<span key="help" className="font-weight-bold">Help</span>));
    }

    return (
        <div className="feedback-holder">
            <div className="feedbackbody p-4">
                <div className="row breadcrumbs mb-4 px-4" style={{alignSelf: "flex-start"}}>
                    <p className="breadcrumbs">
                        {breadcrumbs}
                    </p>
                </div>
                <p><i className="fal fa-handshake-alt handshake rotate"></i></p>
                <p className="h3 title font-weight-bold"> Greenlight Help Center</p>
                <div className="row justify-content-md-center mt-5">
                    <div className="col-md-auto text-center">
                        <a onClick={() => setPdfShown(true)}>
                            <button className="btn btn-outline-dashboard mb-2">
                                <i className="fal fa-file-alt display-3 pb-2"></i><br/>
                                I need help using the product
                            </button>
                        </a>
                    </div>
                    <div className="col-md-auto text-center">
                        <a href="mailto:feedback@croquet.io">
                            <button className="btn btn-outline-dashboard mb-2">
                                <i className="fal fa-comment-alt-dots display-3 pb-2"></i><br/>
                                I want to provide feedback
                            </button>
                        </a>
                    </div>
                </div>
                {maybePdf}
            </div>
        </div>
    );
}
