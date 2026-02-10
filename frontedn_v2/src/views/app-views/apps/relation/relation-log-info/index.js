import React from "react";
import { useParams } from "react-router-dom";
import RelationLogInfo from "../RelationLogInfo";

const INFO = "INFO";

const InfoRelationLog = () => {
	const params = useParams();
	return (
		<RelationLogInfo mode={INFO} param={params}/>
	);
};

export default InfoRelationLog;
