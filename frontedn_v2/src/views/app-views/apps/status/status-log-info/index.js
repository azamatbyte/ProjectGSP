import React from "react";
import { useParams } from "react-router-dom";
import StatusLogInfo from "../StatusLogInfo";

const INFO = "INFO";

const InfoStatusLog = () => {
	const params = useParams();
	return (
		<StatusLogInfo mode={INFO} param={params}/>
	);
};

export default InfoStatusLog;
