import React from "react";
import { useParams } from "react-router-dom";
import FindMatchForm from "../FindMatchForm";

const FindMatch = () => {
	const params = useParams();

  return <FindMatchForm params={params} />;
};

export default FindMatch;
