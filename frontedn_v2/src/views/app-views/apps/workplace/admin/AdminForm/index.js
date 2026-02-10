import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import AuthService from "services/AuthService";
import { useNavigate } from "react-router-dom";
import Request from "utils/request";
import { get_user_by_id } from "utils/api_urls";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";


const ADD = "ADD";
const EDIT = "EDIT";

const AdminForm = props => {

	const { mode = ADD, param = {} } = props;
	const navigate = useNavigate();
	const [form] = Form.useForm();
	const [submitLoading, setSubmitLoading] = useState(false);
	const { id = "" } = param;
	const { t } = useTranslation();


	const userInformation = useCallback (async (id) => {
		try {
			const response = await Request.getRequest(`${get_user_by_id}?id=${id}`);
			const { first_name, last_name, father_name, username, role, birthDate } = response?.data?.user;
			form.setFieldsValue({
				first_name,
				last_name,
				father_name,
				username,
				role,
				birthDate: birthDate ? dayjs(birthDate) : null,
			});
		} catch (error) {
			message.error(t("data_not_found"));
		}
	}, [form, t]);

	useEffect(() => {
		if (mode === EDIT) {
			userInformation(id);
		}
	}, [userInformation, mode, id]);

	const backHandle = () => {
		Modal.confirm({
			title: "Warning",
			content: "Do you want to exit this page?",
			okText: "Yes",
			cancelText: "No",
			onOk: () => {
				navigate("/app/apps/admin/admin-list");
			},
		});
	};

	const onFinish = async () => {
		setSubmitLoading(true);
		if (mode === EDIT) {
			form.validateFields().then(async values => {
				const res = await AuthService.update(id, values);
				if (res.status === 200) {
					setSubmitLoading(false);
					message.success("Admin updated successfully");
					navigate("/app/apps/admin/admin-list");
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error("Please enter all required field ");
			});
		} else {
			form.validateFields().then(async values => {
				const res = await AuthService.create(values);
				if (res.status === 201) {
					setSubmitLoading(false);
					message.success("Admin created successfully");
					navigate("/app/apps/admin/admin-list");
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error("Please enter all required field ");
			});
		}
	};

	return (
		<>
			<Form
				layout="vertical"
				form={form}
				name="advanced_search"
				className="ant-advanced-search-form"
				initialValues={{
					first_name: "",
					last_name: "",
					role: "",
					username: "",
				}}
				onFinish={onFinish}
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3">{mode === "ADD" ? "Add New Admin" : "Edit Admin"} </h2>
							<div className="mb-3">
								<Button className="mr-2" onClick={backHandle}>Back</Button>
								<Button type="primary" htmlType="submit" onClick={onFinish} loading={submitLoading} >
									{mode === "ADD" ? "Add" : "Save"}
								</Button>
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
								label: "General",
								key: "1",
								children: <GeneralField form={form} loading={submitLoading} id={id} mode={mode} />,
							},

						]}
					/>
				</div>
			</Form>
		</>
	);
};

export default AdminForm;
