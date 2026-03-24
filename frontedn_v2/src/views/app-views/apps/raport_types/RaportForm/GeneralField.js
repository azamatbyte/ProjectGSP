import React from "react";
import { Input, Row, Col, Card, Form } from "antd";
import { useTranslation } from "react-i18next";


const GeneralField = props => {
	const { t } = useTranslation();

	return (
		<Row gutter={16}>
			<Col xs={24} sm={24} md={17}>
				<Card>
					<Row gutter={16}>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="name" label={t("name")}>
								<Input
									className="w-100"
									tabIndex={1}
									autoFocus
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"1\"]");
											if (nextInput) nextInput.focus();
										}
									}}
								/>
							</Form.Item>
						</Col>
						{/* <Col xs={24} sm={24} md={12}>
							<Form.Item name="code" label={t("code")}>
								<Input
									className="w-100"
									tabIndex={2}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="code_ru" label={t("code_ru")}>
								<Input
									className="w-100"
									tabIndex={3}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="code_uz" label={t("code_uz")}>
								<Input
									className="w-100"
									tabIndex={4}
								/>
							</Form.Item>
						</Col> */}
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="requested_organization" label={t("organization")}>
								<Input
									className="w-100"
									tabIndex={5}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"5\"]");
											if (nextInput) nextInput.focus();
										}
									}}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="organization" label={t("requested_organization")}>
								<Input
									className="w-100"
									tabIndex={6}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"6\"]");
											if (nextInput) nextInput.focus();
										}
									}}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="rank" label={t("rank")}>
								<Input
									className="w-100"
									tabIndex={7}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"7\"]");
											if (nextInput) nextInput.focus();
										}
									}}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="signed_fio" label={t("full_name")}>
								<Input
									className="w-100"
									tabIndex={8}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"8\"]");
											if (nextInput) nextInput.focus();
										}
									}}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="signed_position" label={t("position")}>
								<Input
									className="w-100"
									tabIndex={9}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"9\"]");
											if (nextInput) nextInput.focus();
										}
									}}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={12}>
							<Form.Item name="notes" label={t("notes")}>
								<Input
									className="w-100"
									tabIndex={10}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"10\"]");
											if (nextInput) nextInput.focus();
										}
									}}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={24} md={24}>
							<Form.Item name="editable_word" label={t("editable_word")}>
								<Input.TextArea
									className="w-100"
									rows={4}
									tabIndex={11}
								/>
							</Form.Item>
						</Col>
					</Row>
				</Card>
			</Col>
		</Row>
	);
};

export default GeneralField;
