import React from "react";
import { useParams } from "react-router-dom";
import SignedForm from "../SignedForm";

const EditSignedList = () => {
	const params = useParams();
	return (
		<SignedForm mode="EDIT" param={params}/>
	);
};

export default EditSignedList;
