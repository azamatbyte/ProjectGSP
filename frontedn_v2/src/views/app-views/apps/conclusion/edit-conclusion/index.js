import React from "react";
import { useParams } from "react-router-dom";
import ConclusionForm from "../ConclusionForm";

const EditConclusion = () => {
  const params = useParams();
  return <ConclusionForm mode="EDIT" param={params} />;
};

export default EditConclusion;
