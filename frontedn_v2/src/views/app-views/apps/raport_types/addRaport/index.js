import React from "react";
import RaportForm from "../RaportForm";
import { useParams } from "react-router-dom";

const AddRaport = () => {
  const params = useParams();
  return (
    <RaportForm
      mode="ADD"
      param={params}
    />
  );
};

export default AddRaport;
