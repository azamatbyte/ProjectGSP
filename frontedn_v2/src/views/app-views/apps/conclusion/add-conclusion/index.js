import React from "react";
import { useParams } from "react-router-dom";
import ConclusionForm from "../ConclusionForm";

const AddConclusion = () => {
  const params = useParams();
  return <ConclusionForm mode="ADD" param={params} />;
};

export default AddConclusion;
