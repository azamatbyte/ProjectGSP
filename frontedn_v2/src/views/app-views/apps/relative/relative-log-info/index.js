import React from "react";
import { useParams } from "react-router-dom";
import RelativeLogInfo from "../RelativeLogInfo";

const INFO = "INFO";

const InfoRelativeLog = () => {
	const params = useParams();
	return (
		<RelativeLogInfo mode={INFO} param={params}/>
	);
};

export default InfoRelativeLog;
