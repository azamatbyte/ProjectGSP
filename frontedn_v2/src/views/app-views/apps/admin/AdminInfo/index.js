import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import ServicesField from "./ServicesField";
import SessionsField from "./SessionsField";
import LogListField from "./LogListField";
import { useNavigate } from "react-router-dom";
import AuthService from "services/AuthService";
import dayjs from "dayjs";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT } from "constants/DateConstant";
import { useTranslation } from "react-i18next";
import { LeftCircleOutlined } from "@ant-design/icons";

const ADD = "ADD";
const INFO = "INFO";

const AdminForm = props => {

	const { mode = ADD, param } = props;
	const navigate = useNavigate();
	const [form] = Form.useForm();
	const [loading, setLoading] = useState(false);
	const {t} = useTranslation();

	const handleBack = useCallback(() => {
		navigate(-1);
	}, [navigate]);

	useEffect(() => {
		if (mode === INFO) {
			const fetchAdminData = async (id) => {
				try {
					setLoading(true);
					const response = await AuthService.getById(id);

					if (response.status !== 200) throw new Error("Failed to fetch data");

					const data = response?.data?.user;

                    form.setFieldsValue({
						first_name: data?.first_name,
						last_name: data?.last_name,
						father_name: data?.father_name,
                        birthDate: data?.birthDate ? dayjs(data?.birthDate).format(DATE_FORMAT_DD_MM_YYYY_WITH_DOT) : null,
						username: data?.username,
						role: data?.role === "admin" ? t("operator") : data?.role === "superAdmin" ? t("super_admin") : data?.role,
						gender: data?.gender === "male" ? t("male") : data?.gender === "female" ? t("female") : data?.gender,
						rank: data?.rank || "",
						position: data?.position || "",
						phone: data?.phone || "",
					});
				} catch (error) {
					message.error(t("failed_to_load_admin_data"));
					console.error("Error fetching data:", error);
				} finally {
					setLoading(false);
				}
			};

			if (param?.id) {
				fetchAdminData(param?.id);
			}
		}
	}, [param?.id,form, mode, t]);

	useEffect(() => {
		const handleEscKey = (event) => {
			if (event.key === "Escape") {
				handleBack();
			}
		};

		document.addEventListener("keydown", handleEscKey);

		return () => {
			document.removeEventListener("keydown", handleEscKey);
		};
	}, [handleBack]);

	return (
		<>
			<Form
				layout="vertical"
				form={form}
				name="advanced_search"
				className="ant-advanced-search-form"
				initialValues={{
					heightUnit: "cm",
					widthUnit: "cm",
					weightUnit: "kg"
				}}
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3"> {t("info_admin")} </h2>
							<div className="mb-3">
								<Button className="mr-2" onClick={() => handleBack()} htmlType="submit"> <LeftCircleOutlined /> {t("back")} </Button>
								{/* <Button type="primary" onClick={() => onFinish()} htmlType="submit" loading={submitLoading} >
									{mode === 'ADD'? 'Add' : `Save`}
								</Button> */}
							</div>
						</Flex>
					</div>
				</PageHeaderAlt>
				<div className="container">
					<Tabs
						defaultActiveKey="1"
						style={{ marginTop: 30 }}
						items={[
							{
								label: t("general"),
								key: "1",
								children: <GeneralField loading={loading} form={form}/>,
							},
							{
								label: t("services_admin"),
								key: "2",
								children: <ServicesField id={param?.id} />,
							},
							{
								label: t("sessions"),
								key: "3",
								children: <SessionsField id={param?.id} />,
							},
							{
								label: t("logs"),
								key: "4",
								children: <LogListField id={param?.id} />,
							},
						]}
					/>
				</div>
			</Form>
		</>
	);
};

export default AdminForm;
