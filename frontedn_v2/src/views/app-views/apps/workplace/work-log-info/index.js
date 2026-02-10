import React from "react";
import { useParams } from "react-router-dom";
import WorkLogInfo from "../WorkLogInfo";

const INFO = "INFO";

const InfoWorkLog = () => {
	const params = useParams();
	return (
		<WorkLogInfo mode={INFO} param={params}/>
	);
};

export default InfoWorkLog;
