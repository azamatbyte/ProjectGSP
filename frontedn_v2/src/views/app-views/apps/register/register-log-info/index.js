import React from "react";
import { useParams } from "react-router-dom";
import RegisterLogInfo from "../RegisterLogInfo";

const INFO = "INFO";

const InfoRegisterLog = () => {
	const params = useParams();
	return (
		<RegisterLogInfo mode={INFO} param={params}/>
	);
};

export default InfoRegisterLog;
