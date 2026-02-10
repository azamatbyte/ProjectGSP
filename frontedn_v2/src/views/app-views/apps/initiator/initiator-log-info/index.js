import React from "react";
import { useParams } from "react-router-dom";
import InitiatorLogInfo from "../InitiatorLogInfo";

const INFO = "INFO";

const InfoInitiatorLog = () => {
	const params = useParams();
	return (
		<InitiatorLogInfo mode={INFO} param={params}/>
	);
};

export default InfoInitiatorLog;
