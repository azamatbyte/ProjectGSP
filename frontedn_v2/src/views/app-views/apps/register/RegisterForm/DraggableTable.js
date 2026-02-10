import { Button, Pagination } from "antd";
import React, { useState, useEffect } from "react";
import { CheckCircleOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { getDateDayString } from "utils/aditionalFunctions";

const DraggableTable = ({ relativeData, setDataSource, setPageNumber,setPageSize,pageNumber,pageSize,setTotal,total }) => {

  const { t } = useTranslation();
  const [items, setItems] = useState(relativeData);

  const [draggedItem, setDraggedItem] = useState(null);

  useEffect(() => {
    setItems(relativeData);
  }, [relativeData]);

  const handleDragStart = (e, index) => {
    setDraggedItem(items[index]);
    e.target.style.opacity = "0.5";
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = "1";
    setDraggedItem(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDelete = (key) => {
    const newItems = items.filter(item => item.key !== key);
    setItems(newItems);
    setDataSource(newItems);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();

    const newItems = [...items];
    const draggedIndex = items.findIndex(item => item.key === draggedItem.key);

    newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, draggedItem);
    setItems(newItems);
    setDataSource(newItems);
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="my-table w-full border-collapse rounded-lg overflow-hidden">
        <thead className="bg-gray-700">
          <tr>
            <th className="p-2 text-left font-medium text-gray-200">{t("drag")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("first_name")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("last_name")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("father_name")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("relation_degree")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("birth_date")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("birth_place")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("residence")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("workplace")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("position")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("notes")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("action")}</th>
            <th className="p-2 text-left font-medium text-gray-200">{t("conclusion")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={item.key}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              className="border-t border-gray-600 hover:bg-gray-800 cursor-move"
            >
              <td
                className="p-2" style={{ cursor: "move" }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
              >
                <svg width="2em" height="2em" viewBox="0 0 16 16" className="inline-block align-middle" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="4" height="4" x="6" y="6" fill="currentColor" rx="1"></rect>
                  <rect width="4" height="4" x="10" y="6" fill="currentColor" rx="1"></rect>
                  <rect width="4" height="4" x="6" y="10" fill="currentColor" rx="1"></rect>
                  <rect width="4" height="4" x="10" y="10" fill="currentColor" rx="1"></rect>
                </svg>
              </td>
              <td className="p-2">{item.firstName}</td>
              <td className="p-2">{item.lastName}</td>
              <td className="p-2">{item.fatherName}</td>
              <td className="p-2">{item.relationDegree}</td>
              <td className="p-2">{item.birthDate? getDateDayString(item.birthDate):item.birthYear?item.birthYear:t("unknown")}</td>
              <td className="p-2">{item.birthPlace}</td>
              <td className="p-2">{item.residence}</td>
              <td className="p-2">{item.workplace}</td>
              <td className="p-2">{item.position}</td>
              <td className="p-2">{item.notes}</td>
              <td className="p-2">
                <Button
                  type="danger"
                  size="small"
                  onClick={() => {handleDelete(item.key);}}
                  icon={<MinusCircleOutlined />}
                >
                  Delete
                </Button>
              </td>
              <td className="p-2">
                <Button
                  type="danger"
                  size="small"
                  onClick={() => console.log("salom")}
                  icon={<CheckCircleOutlined />}
                >
                  add card
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        className="mt-4 text-right"
        current={pageNumber}
        pageSize={pageSize}
        total={total}
        showSizeChanger={true}
        pageSizeOptions={[10, 20, 30, 40, 50]}
        onChange={(pageNumber, pageSize) => {
          setPageNumber(pageNumber);
          setPageSize(pageSize);
        }}
      />
    </div>
  );
};

export default DraggableTable;
