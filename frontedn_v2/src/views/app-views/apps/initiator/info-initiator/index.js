import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import InitiatorInfo from "../InitiatorInfo";

const InfoInitiator = () => {
	const params = useParams();
	const [searchParams] = useSearchParams();
	const redirect = searchParams.get("redirect");
	const searchParamsData = searchParams.get("search");
	const oldRedirect = searchParams.get("oldRedirect");
	return (
		<InitiatorInfo param={params} redirect={redirect ? redirect : null} oldRedirect={oldRedirect ? oldRedirect : null} search={searchParamsData}/>
	);
};

export default InfoInitiator;
